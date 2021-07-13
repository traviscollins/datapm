import chalk from "chalk";
import { passwordValid, validateUsernameOrEmail } from "datapm-lib";
import ora from "ora";
import { exit } from "process";
import prompts from "prompts";
import { Argv } from "yargs";
import * as fetch from "node-fetch";

import {
	CreateAPIKeyDocument,
	DeleteAPIKeyDocument,
	LoginDocument,
	MeDocument,
	MyAPIKeysDocument,
	RegistryStatusDocument,
	Scope
} from "../generated/graphql";
import { addRegistry, getRegistryConfigs, getRegistryConfig, removeRegistry, RegistryConfig } from "../util/ConfigUtil";
import { getRegistryClientWithConfig, RegistryClient } from "../util/RegistryClient";
import { Command } from "./Command";
import os from "os";
import { ApolloClient, ApolloLink, HttpLink, InMemoryCache } from "@apollo/client";
import { defaultPromptOptions } from "../util/ParameterUtils";

const enum Commands {
	LOGIN = "LOGIN",
	LOGOUT = "LOGOUT",
	ADD = "ADD",
	REMOVE = "REMOVE"
}

class RegistryAddArguments {
	url: string;
	apiKey?: string;
}

class RegistryRemoveArguments {
	url: string;
}

class RegistryAuthenticateArguments {
	url?: string | undefined;
	username?: string | undefined;
	password?: string | undefined;
}

class RegistryLogoutArguments {
	url?: string | undefined;
}
export class RegistryCommand implements Command {
	prepareCommand(argv: Argv): Argv {
		return argv.command({
			command: "registry",
			describe: "Manage the localy configured registries",
			builder: (yargs) => {
				return yargs
					.command({
						command: "add <url> [apiKey]",
						describe: "",
						builder: (yargs) => {
							return yargs
								.positional("url", {
									demandOption: true,
									type: "string"
								})
								.positional("apiKey", {
									type: "string"
								});
						},
						handler: addRegistryCommand
					})
					.command({
						command: "remove <url>",
						describe: "",
						builder: (yargs) =>
							yargs.positional("url", {
								demandOption: true,
								type: "string"
							}),
						handler: removeRegistryCommand
					})
					.command({
						command: "list",
						describe: "",
						handler: listRegistries
					})
					.command({
						command: "login [url] [username] [password]",
						describe: "Create and save an API key",
						builder: (yargs) => {
							return yargs
								.positional("url", {
									type: "string"
								})
								.positional("username", {
									type: "string"
								})
								.positional("password", {
									type: "string"
								});
						},
						handler: authenticateToRegistry
					})
					.command({
						command: "logout [url]",
						describe: "Delete an existing API key",
						builder: (yargs) => {
							return yargs.positional("url", {
								type: "string"
							});
						},
						handler: logoutFromRegistry
					});
			},
			handler: defaultRegistryCommandHandler
		});
	}
}

async function defaultRegistryCommandHandler(args: unknown): Promise<void> {
	const commandPromptResult = await prompts({
		type: "select",
		name: "command",
		message: "What action would you like to take?",
		choices: [
			{ title: "Login to registry", value: Commands.LOGIN },
			{ title: "Logout of registry", value: Commands.LOGOUT },
			{ title: "Add anonymous registry", value: Commands.ADD },
			{ title: "Remove local registry configuration", value: Commands.REMOVE }
		],
		initial: 0
	});

	if (commandPromptResult.command === Commands.LOGIN) {
		await authenticateToRegistry(args as RegistryAddArguments);
	} else if (commandPromptResult.command === Commands.LOGOUT) {
		await logoutFromRegistry(args as RegistryRemoveArguments);
	} else if (commandPromptResult.command === Commands.ADD) {
		await addRegistryCommand(args as RegistryAddArguments);
	} else if (commandPromptResult.command === Commands.REMOVE) {
		await removeRegistryCommand(args as RegistryRemoveArguments);
	}
}

async function addRegistryCommand(argv: RegistryAddArguments): Promise<void> {
	await promptForRegistryUrl(argv);

	const registryConf: RegistryConfig = {
		url: argv.url
	};
	if (argv.apiKey) registryConf.apiKey = argv.apiKey;

	addRegistry(registryConf);
	console.log(`Added registry ${registryConf.url} to local configuration`);
}

async function removeRegistryCommand(argv: RegistryRemoveArguments): Promise<void> {
	await promptForRegistryUrl(argv);

	removeRegistry(argv.url);
}

function listRegistries(): void {
	const registries = getRegistryConfigs();

	registries.forEach((registry) => console.log(registry.url));
}

export async function logoutFromRegistry(args: RegistryLogoutArguments): Promise<void> {
	await promptForRegistryUrl(args);

	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	if (getRegistryConfig(args.url!) == null) {
		console.error(chalk.red("The local registry config does not have an entry for that url. Nothing to do."));
		console.error(
			"Use the " + chalk.green("datapm registry list") + " command to view the locally configured registries"
		);
		exit(1);
	}

	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	else if (getRegistryConfig(args.url!)?.apiKey == null) {
		console.error(
			chalk.red(
				"Your registry config has an entry for that URL, but does not have an API key included. Nothing to do."
			)
		);
		console.error(
			"Use the " + chalk.green("datapm registry list") + " command to view the locally configured registries"
		);
		exit(1);
	}

	const oraRef = ora({
		color: "yellow",
		spinner: "dots"
	});

	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const userRegistryClient = getRegistryClientWithConfig({ url: args.url! });

	oraRef.start("Deleting API Key from Registry");

	try {
		await userRegistryClient.getClient().query({
			query: MeDocument
		});

		const apiKeysResponse = await userRegistryClient.getClient().query({
			query: MyAPIKeysDocument
		});

		if (!apiKeysResponse.errors) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const localAPIKey = getRegistryConfig(args.url!)!.apiKey!;

			const localAPIKeyId = Buffer.from(localAPIKey, "base64").toString().split(".")[0];

			const apiKey = apiKeysResponse.data.myAPIKeys?.find((k) => k.id === localAPIKeyId);

			if (apiKey) {
				const deleteAPIKeyResponse = await userRegistryClient.getClient().mutate({
					mutation: DeleteAPIKeyDocument,
					variables: {
						id: apiKey.id
					}
				});

				if (!deleteAPIKeyResponse.errors) {
					oraRef.succeed("Deleted API Key from registry.");
				} else {
					oraRef.warn("There was a problem deleting the API Key from the registry.");
					console.log(chalk.yellow("You will need to manually delete the API from the registry"));
				}
			} else {
				oraRef.warn("API Key not found on registry.");
			}
		} else {
			oraRef.warn("Not able to get user account.");
			console.log(chalk.yellow("You will need to manually delete the API from the registry"));
		}
	} catch (error) {
		oraRef.warn("Not able use existing API Key to contact registry.");
		console.log(chalk.yellow("You will need to manually delete the API from the registry"));
	}

	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	removeRegistry(args.url!);
	oraRef.succeed("Removed local copy of API key");

	process.exit(0);
}

/** Assigns a valid URL to args.url */
async function promptForRegistryUrl(args: { url?: string }): Promise<void> {
	if (args.url == null) {
		while (true) {
			const urlResponse = await prompts(
				[
					{
						type: "text",
						name: "url",
						message: "Registry URL?",
						validate: async (value) => {
							return validUrl(value);
						}
					}
				],
				defaultPromptOptions
			);

			const registryUrlValidation = await validateRegistryUrl(urlResponse.url);
			if (registryUrlValidation === true) {
				args.url = urlResponse.url;
				break;
			} else {
				console.error(chalk.red(registryUrlValidation));
			}
		}
	} else {
		const registryUrlValidation = await validateRegistryUrl(args.url);

		if (registryUrlValidation !== true) {
			console.error(chalk.red(registryUrlValidation));
			exit(1);
		}
	}
}

export async function authenticateToRegistry(args: RegistryAuthenticateArguments): Promise<void> {
	await promptForRegistryUrl(args);

	if (args.username == null) {
		const usernameResponse = await prompts(
			[
				{
					type: "text",
					name: "username",
					message: "Username or Email Address",
					validate: (value) => {
						const valid = validateUsernameOrEmail(value);

						if (valid === "USERNAME_REQUIRED") return "Username required";
						else if (valid === "INVALID_CHARACTERS")
							return "Username must contain only letters, numbers, and hyphens";
						else if (valid === "USERNAME_TOO_LONG") return "Must be shorter than 39 characters ";

						return true;
					}
				}
			],
			defaultPromptOptions
		);

		args.username = usernameResponse.username;
	}

	if (args.password == null) {
		const passwordResponse = await prompts(
			[
				{
					type: "password",
					name: "password",
					message: "Password",
					validate: (value) => {
						const valid = passwordValid(value);

						if (valid === "PASSWORD_REQUIRED") return "Password required";
						else if (valid === "INVALID_CHARACTERS")
							return "Passwords less than 16 characters must include numbers or special characters (0-9@#$%!)";
						else if (valid === "PASSWORD_TOO_LONG") return "Must be shorter than 100 characters ";
						else if (valid === "PASSWORD_TOO_SHORT") return "Must 8 or more characters";

						return true;
					}
				}
			],
			defaultPromptOptions
		);

		args.password = passwordResponse.password;
	}

	const oraRef = ora({
		color: "yellow",
		spinner: "dots"
	});

	oraRef.start("Authenticating...");

	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const anonymousClient = new RegistryClient({ url: args.url! });

	const loginResponse = await anonymousClient.getClient().mutate({
		mutation: LoginDocument,
		variables: {
			password: args.password,
			username: args.username
		}
	});

	if (loginResponse.errors) {
		oraRef.fail("Authentication failed " + loginResponse.errors[0].message);
		exit(1);
	}

	oraRef.succeed("Authenticated");
	const hostname = os.hostname();

	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const userRegistryClient = createRegistryClient(args.url!, loginResponse.data?.login);

	oraRef.start("Looking for existing API Key named " + hostname);

	const getAPIKeysResponse = await userRegistryClient.query({
		query: MyAPIKeysDocument
	});

	if (getAPIKeysResponse.errors) {
		console.error("Error getting API Keys: " + getAPIKeysResponse.errors[0].message);
		exit(1);
	}

	const existingAPIKey = getAPIKeysResponse.data.myAPIKeys?.find((k) => k.label === hostname);

	if (existingAPIKey) {
		oraRef.succeed("Found an existing API Key named " + hostname);
		const confirmDeleteResponse = await prompts(
			[
				{
					type: "confirm",
					name: "delete",
					message: "An API Key named '" + hostname + "' already exists. Delete it?"
				}
			],
			defaultPromptOptions
		);

		if (!confirmDeleteResponse.delete) {
			console.log("Not deleting existing API key. Exiting");
			exit(1);
		}

		oraRef.start("Deleting exisitng API Key...");
		const deleteResponse = await userRegistryClient.mutate({
			mutation: DeleteAPIKeyDocument,
			variables: {
				id: existingAPIKey.id
			}
		});

		if (deleteResponse.errors) {
			oraRef.fail("Error deleting exisitng API Key: " + deleteResponse.errors[0].message);
			exit(1);
		}

		oraRef.succeed("Deleted existing API Key");
	} else {
		oraRef.succeed("No existing API key found");
	}

	oraRef.start("Creating new API Key...");

	const createAPIKeyResponse = await userRegistryClient.mutate({
		mutation: CreateAPIKeyDocument,
		variables: {
			value: {
				label: os.hostname(),
				scopes: [Scope.MANAGE_API_KEYS, Scope.MANAGE_PRIVATE_ASSETS, Scope.READ_PRIVATE_ASSETS]
			}
		}
	});

	if (createAPIKeyResponse.errors) {
		oraRef.fail("Error creating new API Key: " + createAPIKeyResponse.errors[0].message);
		exit(1);
	}

	addRegistry({
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		url: args.url!,
		apiKey: Buffer.from(
			createAPIKeyResponse.data?.createAPIKey.id + "." + createAPIKeyResponse.data?.createAPIKey.secret
		).toString("base64")
	});

	oraRef.succeed("Created and saved new API Key named `" + hostname + "`");
	console.log("Your requests to " + args.url + " will now be authenticated as user " + args.username);

	process.exit(0);
}

function createRegistryClient(url: string, jwt: string | undefined) {
	const headers: { [key: string]: string } = {
		Accept: "charset=utf-8"
	};

	if (jwt) {
		headers.Authorization = "Bearer " + jwt;
	}

	const httpLink = new HttpLink({
		fetch: (fetch as unknown) as WindowOrWorkerGlobalScope["fetch"],
		headers,
		uri: `${url}/graphql`
	});

	return new ApolloClient({
		link: ApolloLink.from([httpLink]),
		cache: new InMemoryCache(),

		defaultOptions: {
			mutate: {
				errorPolicy: "all"
			},
			query: {
				errorPolicy: "all"
			},
			watchQuery: {
				errorPolicy: "all"
			}
		}
	});
}

function validUrl(value: string): boolean | string {
	if (value === "") return true;

	if (!value.startsWith("http://") && !value.startsWith("https://")) {
		return "Must start with http:// or https://";
	}

	if (value.length < 10) {
		return "Not a valid URL - not long enough";
	}

	return true;
}

async function validateRegistryUrl(url: string): Promise<string | true> {
	try {
		const userRegistryClient = createRegistryClient(url, undefined);

		const response = await userRegistryClient.query({
			query: RegistryStatusDocument
		});

		if (response.errors) {
			return response.errors[0].message;
		}
	} catch (e) {
		return e.message;
	}

	return true;
}