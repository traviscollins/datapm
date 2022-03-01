import prompts from "prompts";
import { DPMConfiguration } from "datapm-lib";
import { Repository } from "../repository/Repository";
import { getRepositoryConfigs, RepositoryConfig } from "./ConfigUtil";
import { repeatedlyPromptParameters } from "./parameters/ParameterUtils";
import { JobContext } from "../task/Task";

export async function obtainConnectionConfiguration(
    jobContext: JobContext,
    repository: Repository,
    connectionConfiguration: DPMConfiguration,
    defaults: boolean | undefined,
    overrideDefaultValues: DPMConfiguration = {}
): Promise<{ connectionConfiguration: DPMConfiguration; parameterCount: number } | false> {
    if (!repository.requiresConnectionConfiguration()) return { connectionConfiguration, parameterCount: 0 };

    // Check whether there are existing configurations for this type of repository
    const existingConfiguration = getRepositoryConfigs(repository.getType());

    const pendingParameters = await repository.getConnectionParameters(connectionConfiguration);

    if (
        repository.userSelectableConnectionHistory() &&
        pendingParameters.length > 0 &&
        existingConfiguration.length > 0
    ) {
        const choices: {
            value: RepositoryConfig;
            title: string;
        }[] = [
            {
                value: {
                    identifier: "**NEW**",
                    connectionConfiguration: {}
                },
                title: "New Repository"
            },
            ...existingConfiguration.map((c) => {
                return { value: c, title: c.identifier };
            })
        ];

        const existingConfigurationPromptResult = await prompts({
            name: "connectionConfiguration",
            type: "autocomplete",
            message: "Repository?",
            choices
        });

        if (existingConfigurationPromptResult.connectionConfiguration == null) {
            return false;
        }

        if (existingConfigurationPromptResult.connectionConfiguration.identifier !== "**NEW**") {
            connectionConfiguration = (existingConfigurationPromptResult.connectionConfiguration as RepositoryConfig)
                .connectionConfiguration;
        }
    }

    return promptForConnectionConfiguration(
        jobContext,
        repository,
        connectionConfiguration,
        defaults,
        overrideDefaultValues
    );
}

export async function promptForConnectionConfiguration(
    jobContext: JobContext,
    repository: Repository,
    connectionConfiguration: DPMConfiguration,
    defaults: boolean | undefined,
    overrideDefaultValues: DPMConfiguration = {}
): Promise<{ connectionConfiguration: DPMConfiguration; parameterCount: number }> {
    let connectionSuccess = false;

    let parameterCount = 0;
    while (!connectionSuccess) {
        parameterCount += await repeatedlyPromptParameters(
            jobContext,
            async () => {
                const parameters = await repository.getConnectionParameters(connectionConfiguration);

                return parameters;
            },
            defaults || false,
            overrideDefaultValues
        );

        const connectionTestResults = await repository.testConnection(connectionConfiguration);

        if (typeof connectionTestResults === "string") {
            jobContext.print("ERROR", "Connection failed: " + connectionTestResults);
            connectionConfiguration = {};
        } else {
            connectionSuccess = true;
        }
    }
    return { connectionConfiguration, parameterCount };
}
