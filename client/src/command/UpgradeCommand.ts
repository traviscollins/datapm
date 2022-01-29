import { Argv } from "yargs";
import { Command } from "./Command";
export class UpgradeArguments {}

export class UpgradeCommand implements Command {
    prepareCommand(argv: Argv): Argv {
        return argv.command({
            command: "upgrade",
            describe: "Upgrade datapm client",
            builder: (argv) => {
                return argv;
            },
            handler: updateCommandHandler
        });
    }
}

export async function updateCommandHandler(args: UpgradeArguments): Promise<void> {
    try {
        const command = await import("./UpgradeCommandModule");
        await command.updatePackage(args);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
