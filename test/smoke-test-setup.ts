const log = require("why-is-node-running");
import { GenericContainer, Network, StartedNetwork, StartedTestContainer, Wait } from "testcontainers";
import { exit } from "process";
import { HostPortWaitStrategy, LogWaitStrategy } from "testcontainers/dist/wait-strategy";
import { Readable } from "stream";
import pidtree from "pidtree";
let maildev = require("maildev");
import fs from "fs";
import { expect } from "chai";

let databaseContainer: StartedTestContainer;
let registryContainer: StartedTestContainer;
let mailDevContainer: StartedTestContainer;
let network: StartedNetwork;

let registryContainerReadable: Readable;
export let mailDevWebPortNumber: number;
export let registryServerPort: number;

let containersStarted = false;

before(async function () {
    network = await new Network().start();

    console.log("Starting postgres temporary container");

    this.timeout(120000);
    databaseContainer = await new GenericContainer("postgres")
        .withEnv("POSTGRES_PASSWORD", "postgres")
        .withEnv("POSTGRES_DB", "datapm")
        .withTmpFs({ "/temp_pgdata": "rw,noexec,nosuid,size=65536k" })
        .withExposedPorts(5432)
        .withName("database")
        .withNetworkMode(network.getName())
        .withWaitStrategy(new LogWaitStrategy("database system is ready to accept connections"))
        .start();

    const postgresPortNumber = databaseContainer.getMappedPort(5432);
    const postgresIpAddress = databaseContainer.getIpAddress(network.getName());

    console.log("Postgres started on  " + postgresIpAddress + ":" + postgresPortNumber);

    mailDevContainer = await new GenericContainer("maildev/maildev")
        .withExposedPorts(80, 25)
        .withName("smtp")
        .withNetworkMode(network.getName())
        .start();

    mailDevWebPortNumber = mailDevContainer.getMappedPort(80);
    const mailDevSMTPPortNumber = mailDevContainer.getMappedPort(25);
    const mailDevIpAddress = mailDevContainer.getIpAddress(network.getName());

    console.log(
        "maildev started on  " +
            mailDevIpAddress +
            ", web port" +
            mailDevWebPortNumber +
            " smtp port " +
            mailDevSMTPPortNumber
    );

    console.log("Starting registry container");

    try {
        registryContainer = await new GenericContainer("datapm-registry")
            .withEnv("REGISTRY_NAME", "client-integration-test")
            .withEnv("REGISTRY_URL", "http://localhost:4000")
            .withEnv("REGISTRY_HOSTNAME", "localhost")
            .withEnv("PORT", "4000")
            .withEnv("JWT_AUDIENCE", "localhost")
            .withEnv("JWT_KEY", "!!!REPLACE_ME!!!")
            .withEnv("JWT_ISSUER", "localhost")
            .withEnv("APOLLO_GRAPH_VARIANT", "client-integration-tests")
            .withEnv("GCLOUD_STORAGE_BUCKET_NAME", "media")
            .withEnv("GOOGLE_CLOUD_PROJECT", "adsfasdf")
            .withEnv("MIXPANEL_TOKEN", "asdfasdfasdf")
            .withEnv("TYPEORM_IS_DIST", "true")
            .withEnv("TYPEORM_PORT", "5432")
            .withEnv("TYPEORM_HOST", "database")
            .withEnv("TYPEORM_DATABASE", "datapm")
            .withEnv("TYPEORM_SCHEMA", "public")
            .withEnv("TYPEORM_USERNAME", "postgres")
            .withEnv("TYPEORM_PASSWORD", "postgres")
            .withEnv("SMTP_SERVER", "smtp")
            .withEnv("SMTP_PORT", "25")
            .withEnv("SMTP_USER", "")
            .withEnv("SMTP_PASSWORD", "")
            .withEnv("SMTP_SECURE", "false")
            .withEnv("SMTP_FROM_ADDRESS", "client-integraiton-test@localhost")
            .withEnv("SMTP_FROM_NAME", "client-integration-tests")
            .withEnv("STORAGE_URL", "file:///temp_datapm-registry")
            .withTmpFs({ "/temp_datapm-registry": "rw,noexec,nosuid,size=65536k" })
            .withExposedPorts(4000)
            .withNetworkMode(network.getName())
            .withName("registry")
            .withWaitStrategy(Wait.forLogMessage("🚀 Server ready at http://localhost:4000"))
            .start();
    } catch (error) {
        console.error(JSON.stringify(error, null, 1));
        exit(1);
    }

    registryContainerReadable = await registryContainer.logs();

    registryContainerReadable
        .on("data", (chunk) => {
            //console.log(chunk);
        })
        .on("error", (chunk) => {
            //console.error(chunk);
        })
        .on("close", () => {
            console.log("DataPM registry container closed");
        });

    registryServerPort = registryContainer.getMappedPort(4000);
    console.log("Registry container started on port " + registryServerPort);

    containersStarted = true;
});

after(async function () {
    this.timeout(30000);

    if (registryContainer) await registryContainer.stop();
    console.log("datapm registry container stopped normally");

    if (databaseContainer) await databaseContainer.stop();
    console.log("postgres container stopped normally");

    if (mailDevContainer) await mailDevContainer.stop();
    console.log("maildev container stopped normally");

    if (network) await network.stop();

    registryContainerReadable.destroy();
    maildev = null;

    let pids = pidtree(process.pid, { root: true });
    // recursively kill all child processes
    (await pids).map((p) => {
        if (p == process.pid) return;

        console.warn("Killing process " + p + " this means there is a test leaving a process open");
        try {
            process.kill(p);
        } catch (error) {
            if (error.message.includes("ESRCH")) return;
            console.error("Error killing process " + p);
            console.error(error);
        }
    });

    exit(0);
});

it("Should start", async function () {
    expect(containersStarted).true;
});

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}