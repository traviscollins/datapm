import { ApolloClient, NormalizedCacheObject } from "@apollo/client/core";
import { expect } from "chai";
import { loadPackageFileFromDisk } from "datapm-lib/src/PackageUtil";
import { AdminHolder } from "./admin-holder";
import {
    ActivityLogChangeType,
    AddPackageToCollectionDocument,
    CreateCatalogDocument,
    CreateCollectionDocument,
    CreatePackageDocument,
    CreateVersionDocument,
    JobType,
    NotificationFrequency,
    RunJobDocument,
    SaveFollowDocument,
    UpdatePackageDocument
} from "./registry-client";
import { mailObservable } from "./setup";
import { createUser } from "./test-utils";

describe("Follow Collection's Packages Notifications Tests", async () => {
    const userAUsername = "follow-col-packages-user-a";
    const userBUsername = "follow-col-packages-user-b";

    let userAClient: ApolloClient<NormalizedCacheObject>;
    let userBClient: ApolloClient<NormalizedCacheObject>;

    const userASecondCatalogSlug = "user-a-col-packages-2";
    const userAPackageSlug = "follow-test";
    const collectionSlug = "user-a-col-fol";

    it("Create users A & B", async function () {
        userAClient = await createUser(
            "FirstA",
            "LastA",
            userAUsername,
            userAUsername + "@test.datapm.io",
            "passwordA!"
        );
        userBClient = await createUser(
            "FirstB",
            "LastB",
            userBUsername,
            userBUsername + "@test.datapm.io",
            "passwordB!"
        );
        expect(userAClient).to.exist;
        expect(userBClient).to.exist;
    });

    it("Should allow user A to create a new catalog", async () => {
        const catalogResponse = await userAClient.mutate({
            mutation: CreateCatalogDocument,
            variables: {
                value: {
                    displayName: "User A second catalog",
                    isPublic: true,
                    slug: userASecondCatalogSlug
                }
            }
        });

        expect(catalogResponse.errors).to.be.equal(undefined);
    });

    it("Should allow user A to create a new collection", async () => {
        const collectionResponse = await userAClient.mutate({
            mutation: CreateCollectionDocument,
            variables: {
                value: {
                    collectionSlug: collectionSlug,
                    name: "User A follow Test Collection",
                    description: "test",
                    isPublic: true
                }
            }
        });

        expect(collectionResponse.errors).to.be.equal(undefined);
    });

    it("Should allow user A to create a package", async () => {
        const createPackageResponse = await userAClient.mutate({
            mutation: CreatePackageDocument,
            variables: {
                value: {
                    catalogSlug: userASecondCatalogSlug,
                    packageSlug: userAPackageSlug,
                    displayName: "Congressional LegislatorsA",
                    description: "Test move of congressional legislatorsA"
                }
            }
        });

        expect(createPackageResponse.errors).to.equal(undefined);

        let packageFileContents = loadPackageFileFromDisk("test/packageFiles/congressional-legislators.datapm.json");
        const packageFileString = JSON.stringify(packageFileContents);

        const createVersionResponse = await userAClient.mutate({
            mutation: CreateVersionDocument,
            variables: {
                identifier: {
                    catalogSlug: userASecondCatalogSlug,
                    packageSlug: userAPackageSlug
                },
                value: {
                    packageFile: packageFileString
                }
            }
        });
        expect(createVersionResponse.errors).to.equal(undefined);
    });

    it("Should allow user A to add package to collection", async () => {
        const response = await userAClient.mutate({
            mutation: AddPackageToCollectionDocument,
            variables: {
                packageIdentifier: {
                    catalogSlug: userASecondCatalogSlug,
                    packageSlug: userAPackageSlug
                },
                collectionIdentifier: {
                    collectionSlug
                }
            }
        });

        expect(response.errors).to.equal(undefined);
    });

    it("Should allow user B to follow collection", async () => {
        const followResponse = await userBClient.mutate({
            mutation: SaveFollowDocument,
            variables: {
                follow: {
                    collection: {
                        collectionSlug: collectionSlug
                    },
                    followAllPackages: true,
                    notificationFrequency: NotificationFrequency.INSTANT,
                    changeType: [ActivityLogChangeType.VERSION_FIRST_VERSION]
                }
            }
        });

        expect(followResponse.errors).to.be.equal(undefined);
    });

    it("Should allow user A to update package", async () => {
        await userAClient.mutate({
            mutation: UpdatePackageDocument,
            variables: {
                identifier: {
                    catalogSlug: userASecondCatalogSlug,
                    packageSlug: userAPackageSlug
                },
                value: {
                    isPublic: true
                }
            }
        });
    });

    it("Should send email after instant notification updates containing packages followed through collection", async () => {
        let userBEmail: any = null;

        let emailPromise = new Promise<void>((r) => {
            let subscription = mailObservable.subscribe((email) => {
                if (email.to[0].address === userBUsername + "@test.datapm.io") {
                    userBEmail = email;
                }

                if (userBEmail) {
                    subscription.unsubscribe();
                    r();
                }
            });
        });

        const response = await AdminHolder.adminClient.mutate({
            mutation: RunJobDocument,
            variables: {
                key: "TEST_JOB_KEY",
                job: JobType.INSTANT_NOTIFICATIONS
            }
        });

        expect(response.errors).eq(undefined);

        await emailPromise;

        expect(userBEmail.text).to.contain("This is your instant");
        expect(userBEmail.text).to.contain("added package user-a-col-packages-2/follow-test");
        expect(userBEmail.text).to.contain("follow-col-packages-user-a published version 1.0.0");
        expect(userBEmail.text).to.contain("http://localhost:4200/follow-col-packages-user-b#user-following");
    });
});