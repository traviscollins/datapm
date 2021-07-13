import { ApolloQueryResult } from "@apollo/client";
import chalk from "chalk";
import ora from "ora";
import { Argv } from "yargs";
import { Catalog } from "../generated/graphql";
import { getRegistryConfigs } from "../util/ConfigUtil";
import { RegistryClient } from "../util/RegistryClient";
import { Command } from "./Command";

export class CatalogsCommand implements Command {
	prepareCommand(argv: Argv): Argv {
		return argv.command({
			command: "catalogs",
			describe: "View your catalogs",
			handler: this.viewCatalogs
		});
	}

	async viewCatalogs(): Promise<void> {
		const oraRef = ora({
			color: "yellow",
			spinner: "dots"
		});

		const registries = getRegistryConfigs();
		if (registries.length === 0) {
			console.log(chalk.yellow("No registries added yet"));
			process.exit(0);
		}

		// Fetching catalogs
		oraRef.start("Fetching catalogs");

		let registryResponses: ApolloQueryResult<{ myCatalogs: Catalog[] }>[] = [];

		try {
			registryResponses = await Promise.all(
				registries.map((registry) => {
					const registryClient = new RegistryClient(registry);
					return registryClient.getCatalogs();
				})
			);
			oraRef.succeed();
		} catch (error) {
			oraRef.fail();
			console.log(chalk.red(error.message));
			process.exit(1);
		}

		registryResponses.forEach((response) => {
			if (response.errors) {
				response.errors.forEach((error: Error) => {
					console.log(chalk.red(error.message));
				});
			}
			if (response.data) {
				response.data.myCatalogs.forEach((catalog: Catalog) => {
					console.log(catalog.displayName);
				});
			}
		});
	}
}
