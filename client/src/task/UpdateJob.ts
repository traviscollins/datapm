import chalk from "chalk";
import { comparePackages, diffCompatibility, nextVersion, PackageFile, Schema, StreamSet } from "datapm-lib";
import { Permission } from "../generated/graphql";
import { SourceInspectionContext } from "../repository/Source";
import { getPackage, PackageFileWithContext, RegistryPackageFileContext } from "../util/PackageAccessUtil";
import { checkPackagePermissionsOnRegistry } from "../util/RegistryPermissions";
import { JobContext, Job, JobResult } from "./Task";
import clone from "rfdc";
import { getRepositoryDescriptionByType } from "../repository/RepositoryUtil";
import { getSourceByType } from "../repository/SourceUtil";
import { obtainConnectionConfiguration } from "../util/ConnectionUtil";
import { getRepositoryCredential } from "../util/ConfigUtil";
import { obtainCredentialsConfiguration } from "../util/CredentialsUtil";
import { differenceToString } from "../util/PackageUtil";
import { SemVer } from "semver";
import { filterBadSchemaProperties, inspectSource, inspectStreamSet } from "./PackageJob";
import { ParameterType } from "../util/parameters/Parameter";

export class UpdateArguments {
    reference?: string;
    defaults?: boolean;
    forceUpdate?: boolean;
}

export class UpdatePackageTask extends Job<PackageFileWithContext> {
    constructor(private jobContext: JobContext, private argv: UpdateArguments) {
        super(jobContext);
    }

    async _execute(): Promise<JobResult<PackageFileWithContext>> {
        if (this.argv.reference == null) {
            const referencePromptResult = await this.jobContext.parameterPrompt([
                {
                    type: ParameterType.Text,
                    name: "reference",
                    configuration: {},
                    message: "What is the package name, url, or file name?",
                    validate2: (value) => {
                        if (!value) return "Package file name or url required";
                        return true;
                    }
                }
            ]);

            this.argv.reference = referencePromptResult.reference;
        }

        if (this.argv.reference == null) throw new Error("Package file or URL is required");

        // Finding package
        let task = await this.jobContext.startTask("Finding package file...");

        const packageFileWithContext = await getPackage(this.argv.reference, "canonicalIfAvailable").catch(
            async (error) => {
                await task.end("ERROR", error.message);
                return 1;
            }
        );

        if (typeof packageFileWithContext === "number") {
            return {
                exitCode: 1,
                result: undefined
            };
        }

        await task.end("SUCCESS", "Found package file");

        task = await this.jobContext.startTask("Checking edit permissions...");

        if (packageFileWithContext.contextType === "registry") {
            const registryPackageFileContext = packageFileWithContext as RegistryPackageFileContext;

            try {
                await checkPackagePermissionsOnRegistry(
                    {
                        catalogSlug: packageFileWithContext.catalogSlug as string,
                        packageSlug: packageFileWithContext.packageFile.packageSlug
                    },
                    registryPackageFileContext.registryUrl,
                    Permission.EDIT
                );
            } catch (error) {
                if (error.message === "NOT_AUTHORIZED") {
                    await task.end(
                        "ERROR",
                        "You do not have permission to edit this package. Contact the package manager to request edit permission"
                    );
                    return {
                        exitCode: 1
                    };
                } else if (error.message === "NOT_AUTHENTICATED") {
                    await task.end("ERROR", "You are not logged in to the registry.");
                    this.jobContext.print("INFO", chalk.green("Use the following command to login"));
                    this.jobContext.print(
                        "INFO",
                        chalk.green("datapm registry login " + registryPackageFileContext.registryUrl)
                    );
                    return {
                        exitCode: 1
                    };
                }

                await task.end("ERROR", "There was an error checking package permissions: " + error.message);
                return {
                    exitCode: 1
                };
            }
        }

        const oldPackageFile = packageFileWithContext.packageFile;

        if (!packageFileWithContext.permitsSaving) {
            await task.end("ERROR", "Packages can not be saved to " + packageFileWithContext.contextType);
            return {
                exitCode: 1
            };
        }

        if (!packageFileWithContext.hasPermissionToSave) {
            await task.end(
                "ERROR",
                "You do not have permission to save to " + packageFileWithContext.packageFileUrl.replace("file://", "")
            );
            return {
                exitCode: 1
            };
        }

        await task.end("SUCCESS", "Edit permission found");

        task = await this.jobContext.startTask("Checking package is canonical...");
        if (packageFileWithContext.packageFile.canonical === false) {
            await task.end(
                "ERROR",
                "Package is not canonical. It has been modified for security or convenience reasons."
            );

            if (packageFileWithContext.packageFile.modifiedProperties !== undefined) {
                this.jobContext.print(
                    "INFO",
                    "Modified properties include: " + packageFileWithContext.packageFile.modifiedProperties.join(", ")
                );

                this.jobContext.print("INFO", "Use the original package file, or contact the package author.");
            }
            return {
                exitCode: 1
            };
        }

        await task.end("SUCCESS", "Package is canonical");

        const sourceInspectionContext: SourceInspectionContext = {
            defaults: this.argv.defaults || false,
            quiet: false,
            jobContext: this.jobContext,
            parameterPrompt: async (parameters) => {
                this.jobContext.parameterPrompt(parameters);
            }
        };

        let newPackageFile: PackageFile = clone()(oldPackageFile);
        newPackageFile.schemas = [];
        newPackageFile.sources = [];

        for (const sourceObject of oldPackageFile.sources) {
            const repositoryDescription = getRepositoryDescriptionByType(sourceObject.type);

            if (repositoryDescription == null) {
                this.jobContext.print("FAIL", "No repository found to inspect this data - " + sourceObject.type);
                return {
                    exitCode: 1
                };
            }

            const repository = await repositoryDescription.getRepository();

            const sourceDescription = getSourceByType(sourceObject.type);
            const source = await (await sourceDescription)?.getSource();

            if (source == null) {
                this.jobContext.print(
                    "FAIL",
                    "No source implementation found to inspect this data - " + sourceObject.type
                );
                return {
                    exitCode: 1
                };
            }

            const connectionConfigurationResults = await obtainConnectionConfiguration(
                this.jobContext,
                repository,
                sourceObject.connectionConfiguration,
                this.argv.defaults
            );

            if (connectionConfigurationResults === false) {
                return {
                    exitCode: 1
                };
            }
            const connectionConfiguration = connectionConfigurationResults.connectionConfiguration;

            const repositoryIdentifier = await repository.getConnectionIdentifierFromConfiguration(
                connectionConfiguration
            );

            let credentialsConfiguration = {};

            if (sourceObject.credentialsIdentifier) {
                try {
                    credentialsConfiguration = await getRepositoryCredential(
                        repository.getType(),
                        repositoryIdentifier,
                        sourceObject.credentialsIdentifier
                    );
                } catch (error) {
                    this.jobContext.print(
                        "ERROR",
                        "The credential " + sourceObject.credentialsIdentifier + " could not be found or read."
                    );
                }
            }

            const credentialsConfigurationResults = await obtainCredentialsConfiguration(
                this.jobContext,
                repository,
                connectionConfiguration,
                credentialsConfiguration,
                this.argv.defaults
            );

            if (credentialsConfigurationResults === false) {
                return {
                    exitCode: 1
                };
            }

            credentialsConfiguration = credentialsConfigurationResults.credentialsConfiguration;

            const uriInspectionResults = await inspectSource(
                source,
                sourceInspectionContext,
                this.jobContext,
                sourceObject.connectionConfiguration,
                credentialsConfiguration,
                sourceObject.configuration || {}
            );

            const streamSets: StreamSet[] = [];
            for (const streamSet of uriInspectionResults.streamSetPreviews) {
                const streamInspectionResult = await inspectStreamSet(
                    streamSet,
                    sourceInspectionContext,
                    this.jobContext,
                    sourceObject.configuration || {}
                );

                newPackageFile.schemas = [...newPackageFile.schemas, ...streamInspectionResult.schemas];
                streamSets.push({
                    configuration: streamSet.configuration,
                    schemaTitles: streamInspectionResult.schemas.map((s: Schema) => s.title as string),
                    slug: streamSet.slug,
                    streamStats: streamInspectionResult.streamStats,
                    lastUpdateHash: streamSet.updateHash
                });
            }
            newPackageFile.sources.push({
                ...sourceObject,
                streamSets: streamSets
            });
        }

        for (const newSchema of newPackageFile.schemas) {
            newSchema.properties = filterBadSchemaProperties(newSchema);
        }

        // Apply attribute names to new schemas
        for (const oldSchema of oldPackageFile.schemas) {
            const newSchema = newPackageFile.schemas.find((s) => s.title === oldSchema.title);

            if (newSchema == null || newSchema.properties == null) continue;

            newSchema.unit = oldSchema.unit;

            for (const oldAttributeName in oldSchema.properties) {
                const oldProperty = oldSchema.properties[oldAttributeName];

                const newProperty = newSchema.properties[oldAttributeName];

                if (newProperty == null) continue;

                newProperty.title = oldProperty.title;
                newProperty.unit = oldProperty.unit;
                newProperty.hidden = oldProperty.hidden;
            }
        }

        // Show the user the package information

        this.jobContext.print("NONE", "");
        this.jobContext.print("NONE", chalk.magenta("Inspection Result"));
        this.jobContext.print("NONE", `${chalk.gray("Package slug: ")} ${chalk.yellow(oldPackageFile.packageSlug)}`);
        this.jobContext.print(
            "NONE",
            `${chalk.gray("Existing package description: ")} ${chalk.yellow(oldPackageFile.description)}`
        );
        this.jobContext.print(
            "NONE",
            `${chalk.gray("Last updated date: ")} ${chalk.yellow(oldPackageFile.updatedDate)}`
        );

        let differences = comparePackages(oldPackageFile, newPackageFile);
        if (differences.length === 0) {
            this.jobContext.print("NONE", "No differences found");
        } else {
            this.jobContext.print("NONE", `Found ${differences.length} differences`);
        }
        differences.forEach((difference) => {
            this.jobContext.print("NONE", chalk.yellow(differenceToString(difference)));
        });

        this.jobContext.print("NONE", "");
        this.jobContext.print("NONE", chalk.magenta("Schema Refinement"));

        differences = comparePackages(oldPackageFile, newPackageFile);

        const compatibility = diffCompatibility(differences);

        const lastestVersionSemVer = new SemVer(oldPackageFile.version);

        const minNextVersion = nextVersion(lastestVersionSemVer, compatibility);

        newPackageFile = {
            ...newPackageFile,
            updatedDate: new Date(),
            version: minNextVersion.format()
        };

        await packageFileWithContext.save(this.jobContext, newPackageFile);

        return {
            exitCode: 0,
            result: packageFileWithContext
        };
    }
}
