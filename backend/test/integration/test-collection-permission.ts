import { ApolloClient, NormalizedCacheObject } from "@apollo/client/core";
import { expect } from "chai";
import {
    CreateCollectionDocument,
    CreatePackageDocument,
    Permission,
    SetUserCollectionPermissionsDocument,
    DeleteUserCollectionPermissionsDocument,
    CollectionDocument
} from "./registry-client";
import { createUser } from "./test-utils";
import { describe, it } from "mocha";

describe("Collection Permissions", async () => {
    let userAClient: ApolloClient<NormalizedCacheObject>;
    let userBClient: ApolloClient<NormalizedCacheObject>;

    before(async () => {});

    it("Create users A & B", async function () {
        userAClient = await createUser("Alol", "Aulu", "my-test-user100", "hellocat12@test.datapm.io", "catPassword2!");
        userBClient = await createUser("Foo1", "Bar2", "my-test-user101", "hellocat13@test.datapm.io", "catPassword2!");

        expect(userAClient).to.exist;
        expect(userBClient).to.exist;
    });

    it("user attempting to grant permissions to a collection on which they do not have the MANAGE permission", async function () {
        await userAClient.mutate({
            mutation: CreateCollectionDocument,
            variables: {
                value: {
                    collectionSlug: "testA-collection-permissions",
                    name: "testing collectionPackages1",
                    description: "asdfsdfsdf"
                }
            }
        });

        await userAClient.mutate({
            mutation: CreatePackageDocument,
            variables: {
                value: {
                    catalogSlug: "my-test-user100",
                    packageSlug: "congressional-legislators1",
                    displayName: "Congressional Legislators1",
                    description: "Test upload of congressional legislators1"
                }
            }
        });

        const newPermissions = [Permission.VIEW];

        let response = await userBClient.mutate({
            mutation: SetUserCollectionPermissionsDocument,
            variables: {
                identifier: {
                    collectionSlug: "testA-collection-permissions"
                },
                value: {
                    username: "my-test-user100",
                    permissions: newPermissions
                }
            }
        });

        expect(response.errors![0].message).to.equal("NOT_AUTHORIZED");
    });

    it("attempting to grant permissions to a user that does not exist", async function () {
        const newPermissions = [Permission.VIEW];

        let response = await userAClient.mutate({
            mutation: SetUserCollectionPermissionsDocument,
            variables: {
                identifier: {
                    collectionSlug: "testA-collection-permissions"
                },
                value: {
                    username: "my-test-user102",
                    permissions: newPermissions
                }
            }
        });

        expect(response.errors![0].message).to.equal("USER_NOT_FOUND - my-test-user102");
    });

    it("successfully setting permissions for authorized use case", async function () {
        const newPermissions = [Permission.VIEW];
        let response = await userAClient.mutate({
            mutation: SetUserCollectionPermissionsDocument,
            variables: {
                identifier: {
                    collectionSlug: "testA-collection-permissions"
                },
                value: {
                    username: "my-test-user101",
                    permissions: newPermissions
                }
            }
        });

        expect(response.errors! == null).true;
    });

    it("updating user permissions by changing the permissions list", async function () {
        const newPermissions = [Permission.VIEW, Permission.EDIT];

        let response = await userAClient.mutate({
            mutation: SetUserCollectionPermissionsDocument,
            variables: {
                identifier: {
                    collectionSlug: "testA-collection-permissions"
                },
                value: {
                    username: "my-test-user101",
                    permissions: newPermissions
                }
            }
        });

        expect(response.errors! == null).true;
    });

    it("Validate that the target user has the permission granted to view a collection that they did not previously", async function () {
        await userAClient.mutate({
            mutation: CreateCollectionDocument,
            variables: {
                value: {
                    collectionSlug: "testF-collection",
                    name: "testing collectionPackages5",
                    description: "UserB Will Find This After Granted View Permissions"
                }
            }
        });

        await userAClient.mutate({
            mutation: CreatePackageDocument,
            variables: {
                value: {
                    catalogSlug: "my-test-user100",
                    packageSlug: "congressional-legislators5",
                    displayName: "Congressional Legislators5",
                    description: "Test upload of congressional legislators"
                }
            }
        });

        const beforeGrantedViewOnUserB = await userBClient.query({
            query: CollectionDocument,
            variables: {
                identifier: {
                    collectionSlug: "testF-collection"
                }
            }
        });

        const newPermissions = [Permission.VIEW];

        await userAClient.mutate({
            mutation: SetUserCollectionPermissionsDocument,
            variables: {
                identifier: {
                    collectionSlug: "testF-collection"
                },
                value: {
                    username: "my-test-user101",
                    permissions: newPermissions
                }
            }
        });

        const afterGrantedViewOnUserB = await userBClient.query({
            query: CollectionDocument,
            variables: {
                identifier: {
                    collectionSlug: "testF-collection"
                }
            }
        });

        expect(beforeGrantedViewOnUserB.errors![0].message).to.equal("NOT_AUTHORIZED");
        expect(beforeGrantedViewOnUserB.data).to.equal(null);
        expect(afterGrantedViewOnUserB.data?.collection.name).to.equal("testing collectionPackages5");
        expect(afterGrantedViewOnUserB.data?.collection.description).to.equal(
            "UserB Will Find This After Granted View Permissions"
        );
    });
});