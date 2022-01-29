import { UpgradeArguments } from "./UpgradeCommand";
import ora from "ora";
import os from "os";
import fetch from "node-fetch";
import { createWriteStream } from "fs";
import { pipeline } from "stream";
import { spawn } from "child_process";

export async function updatePackage(_argv: UpgradeArguments): Promise<void> {
    const oraRef: ora.Ora = ora({
        color: "yellow",
        spinner: "dots"
    });

    if (os.type() === "Darwn") {
        await upgradeDarwin(oraRef);
    }
}

async function upgradeDarwin(oraRef: ora.Ora) {
    oraRef.start("Downloading latest client");

    const filePath = await downloadPackageFile("macos", "64");

    oraRef.succeed("Client downloaded at " + filePath);

    oraRef.info("Launching installer. Use the installer to complete the upgrade.");
    spawn("open", [filePath]);
}

async function downloadPackageFile(name: "macos" | "win" | "debian", arch: "64") {
    const response = await fetch(`https://datapm.io/client-installer/${name}${arch}`);

    const fileNameRegex = /filename="(.*)"/;

    const contentDisposition = response.headers.get("content-disposition");

    if (contentDisposition == null) {
        throw new Error("Server did not send a file name");
    }

    const fileNameMatches = contentDisposition.match(fileNameRegex);

    if (!fileNameMatches || fileNameMatches?.length === 0) {
        throw new Error("Error finding file name in content disposition");
    }

    const fileName = fileNameMatches[1];
    const filePath = "~/Downloads/" + fileName;

    const writeStream = createWriteStream(filePath);

    return new Promise<string>((resolve, reject) => {
        pipeline(response.body, writeStream, (err) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(filePath);
        });
    });
}
