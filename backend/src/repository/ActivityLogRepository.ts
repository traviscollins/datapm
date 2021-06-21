import { Connection, EntityManager, EntityRepository, In, Repository } from "typeorm";
import { ActivityLogEntity } from "../entity/ActivityLogEntity";
import { CatalogEntity } from "../entity/CatalogEntity";
import { CollectionEntity } from "../entity/CollectionEntity";
import { FollowEntity } from "../entity/FollowEntity";
import { PackageEntity } from "../entity/PackageEntity";
import { UserEntity } from "../entity/UserEntity";
import { VersionEntity } from "../entity/VersionEntity";
import { ActivityLogChangeType, ActivityLogEventType } from "../generated/graphql";

export interface ActivityLogTemp {
    userId: number;
    eventType: ActivityLogEventType;
    changeType?: ActivityLogChangeType;
    targetPackageId?: number;
    targetPackageIssueId?: number;
    targetPackageVersionId?: number;
    targetCatalogId?: number;
    targetCollectionId?: number;
    targetUserId?: number;
    propertiesEdited?: string[];
}

/** Creates a new ActivityLog entry in the database, and logs it */
export async function createActivityLog(connection: EntityManager | Connection, activityLogTemp: ActivityLogTemp) {
    const activityLog = new ActivityLogEntity();
    activityLog.eventType = activityLogTemp.eventType;
    activityLog.changeType = activityLogTemp.changeType;
    activityLog.userId = activityLogTemp.userId;
    activityLog.targetPackageId = activityLogTemp.targetPackageId;
    activityLog.targetPackageIssueId = activityLogTemp.targetPackageIssueId;
    activityLog.targetPackageVersionId = activityLogTemp.targetPackageVersionId;
    activityLog.targetCatalogId = activityLogTemp.targetCatalogId;
    activityLog.targetCollectionId = activityLogTemp.targetCollectionId;
    activityLog.propertiesEdited = activityLogTemp.propertiesEdited;

    if (activityLogTemp.userId) {
        const user = await connection.getRepository(UserEntity).findOneOrFail({ id: activityLogTemp.userId });

        activityLog.username = user.username;
    }

    if (activityLogTemp.targetPackageId) {
        const packageEntity = await connection
            .getRepository(PackageEntity)
            .findOneOrFail({ id: activityLogTemp.targetPackageId }, { relations: ["catalog"] });

        activityLog.targetPackageIdentifier = packageEntity.catalog.slug + "/" + packageEntity.slug;
    }

    if (activityLogTemp.targetPackageVersionId) {
        const version = await connection
            .getRepository(VersionEntity)
            .findOneOrFail({ id: activityLogTemp.targetPackageVersionId });

        activityLog.targetVersionNumber = `${version?.majorVersion}.${version?.minorVersion}.${version?.patchVersion}`;
    }

    if (activityLogTemp.targetCatalogId) {
        const catalog = await connection
            .getRepository(CatalogEntity)
            .findOneOrFail({ id: activityLogTemp.targetCatalogId });

        activityLog.targetCatalogSlug = catalog.slug;
    }

    if (activityLogTemp.targetCollectionId) {
        const collection = await connection
            .getRepository(CollectionEntity)
            .findOneOrFail({ id: activityLogTemp.targetCollectionId });

        activityLog.targetCollectionSlug = collection.collectionSlug;
    }

    await connection.getCustomRepository(ActivityLogRepository).createLog(activityLog);
}
@EntityRepository(ActivityLogEntity)
export class ActivityLogRepository extends Repository<ActivityLogEntity> {
    async createLog(activityLog: ActivityLogEntity): Promise<void> {
        return this.manager.nestedTransaction(async (transaction) => {
            const entity = transaction.create(ActivityLogEntity, activityLog);
            if (
                activityLog.eventType !== ActivityLogEventType.PACKAGE_DELETED &&
                activityLog.eventType !== ActivityLogEventType.VERSION_DELETED &&
                activityLog.eventType !== ActivityLogEventType.COLLECTION_DELETED &&
                activityLog.eventType !== ActivityLogEventType.CATALOG_DELETED &&
                activityLog.eventType !== ActivityLogEventType.USER_DELETED
            ) {
                await transaction.save(entity);
            }

            if (process.env.ACTIVITY_LOG === "true")
                console.info(
                    JSON.stringify({
                        _type: "ActivityLog",
                        date: new Date().toISOString(),
                        ...activityLog
                    })
                );
        });
    }

    async myRecentlyViewedPackages(
        user: UserEntity,
        limit: number,
        offSet: number,
        relations?: string[]
    ): Promise<[ActivityLogEntity[], number]> {
        if (relations == null) relations = [];

        if (!relations?.includes("targetPackage")) relations.push("targetPackage");

        const [activityLogEntities, count] = await this.manager
            .getRepository(ActivityLogEntity)
            .createQueryBuilder("ActivityLog")
            .where(
                '"ActivityLog"."id" IN ( WITH summary AS ( SELECT "ActivityLog".id as id, "ActivityLog"."created_at" as "created_at",  ROW_NUMBER() OVER(PARTITION BY "ActivityLog".target_package_id  ORDER BY "ActivityLog".created_at DESC) AS rk FROM "public"."activity_log" "ActivityLog" where "ActivityLog".event_type  = \'PACKAGE_VIEWED\' and "ActivityLog".user_id  = :user_id ORDER BY "ActivityLog".created_at DESC LIMIT 1000 ) SELECT s.id FROM summary s WHERE s.rk = 1 order by s.created_at desc )',
                {
                    user_id: user.id
                }
            )
            .orderBy('"ActivityLog"."created_at"', "DESC")
            .limit(limit)
            .offset(offSet)
            .getManyAndCount();

        return [activityLogEntities, count];
    }

    async myRecentlyViewedCollections(
        user: UserEntity,
        limit: number,
        offSet: number,
        relations?: string[]
    ): Promise<[ActivityLogEntity[], number]> {
        if (relations == null) relations = [];

        if (!relations?.includes("targetCollection")) {
            relations.push("targetCollection");
        }

        const [activityLogEntities, count] = await this.manager
            .getRepository(ActivityLogEntity)
            .createQueryBuilder("ActivityLog")
            .where(
                '"ActivityLog"."id" IN ( WITH summary AS ( SELECT "ActivityLog".id as id, "ActivityLog"."created_at" as "created_at",  ROW_NUMBER() OVER(PARTITION BY "ActivityLog".target_collection_id  ORDER BY "ActivityLog".created_at DESC) AS rk FROM "public"."activity_log" "ActivityLog" where "ActivityLog".event_type  = \'COLLECTION_VIEWED\' and "ActivityLog".user_id  = :user_id ORDER BY "ActivityLog".created_at DESC LIMIT 1000 ) SELECT s.id FROM summary s WHERE s.rk = 1 order by s.created_at desc )',
                {
                    user_id: user.id
                }
            )
            .andWhere(
                'EXISTS (SELECT 1 FROM collection_package WHERE collection_id = "ActivityLog".target_collection_id)'
            )
            .orderBy('"ActivityLog"."created_at"', "DESC")
            .limit(limit)
            .offset(offSet)
            .getManyAndCount();

        return [activityLogEntities, count];
    }

    async getUserFollowingActivity(
        userId: number,
        offset: number,
        limit: number,
        relations?: string[]
    ): Promise<[ActivityLogEntity[], number]> {
        if (relations == null) {
            relations = [];
        }

        const alias = "ActivityLog";
        const wow = this.manager
            .getRepository(ActivityLogEntity)
            .createQueryBuilder(alias)
            .distinctOn(["id"])
            .innerJoin(
                (sb) => sb.select('"f".*').from(FollowEntity, "f").where('"f"."user_id" = :userId'),
                "Follow",
                `"ActivityLog"."event_type" IN (SELECT * FROM unnest("Follow"."event_types"))
                AND
                CASE
                    WHEN "Follow"."target_collection_id" IS NOT NULL THEN
                        (
                            (SELECT c.is_public FROM collection c WHERE c.id = "ActivityLog".target_collection_id) IS TRUE
                            OR EXISTS (SELECT cu.collection_id FROM collection_user cu WHERE "ActivityLog".target_collection_id = cu.collection_id AND cu.user_id = "Follow".user_id)
                        )
                    WHEN "Follow".target_catalog_id IS NOT NULL THEN
                        (
                            (SELECT c."isPublic" FROM catalog c WHERE c.id = "ActivityLog".target_catalog_id) IS TRUE
                            OR EXISTS (SELECT cu.catalog_id FROM user_catalog cu WHERE "ActivityLog".target_catalog_id = cu.catalog_id AND cu.user_id = "Follow".user_id)
                        )
                    END
                AND (
                    CASE
                        WHEN "ActivityLog".target_package_id IS NULL THEN TRUE
                        ELSE
                            (SELECT pkg."isPublic" FROM package pkg WHERE pkg.id = "ActivityLog".target_package_id) IS TRUE
                            OR EXISTS (SELECT pu.package_id FROM user_package_permission pu WHERE "ActivityLog".target_package_id = pu.package_id AND pu.user_id = "Follow".user_id)
                    END
                )`
            )
            .setParameter("userId", userId)
            .orderBy('"ActivityLog"."created_at"', "DESC")
            .offset(offset)
            .limit(limit)
            .addRelations(alias, relations);

        console.log(wow.getQuery());
        return await this.manager
            .getRepository(ActivityLogEntity)
            .createQueryBuilder(alias)
            .distinct(true)
            .innerJoin(
                (sb) => sb.select('"f".*').from(FollowEntity, "f").where('"f"."user_id" = :userId'),
                "Follow",
                `"ActivityLog"."event_type" IN (SELECT * FROM unnest("Follow"."event_types"))
                AND
                CASE
                    WHEN "Follow"."target_collection_id" IS NULL THEN TRUE
                    WHEN "Follow"."target_collection_id" IS NOT NULL THEN
                        (
                            (SELECT c.is_public FROM collection c WHERE c.id = "ActivityLog".target_collection_id) IS TRUE
                            OR EXISTS (SELECT cu.collection_id FROM collection_user cu WHERE "ActivityLog".target_collection_id = cu.collection_id AND cu.user_id = "Follow".user_id)
                        )
                    WHEN "Follow"."target_catalog_id" IS NULL THEN TRUE
                    WHEN "Follow".target_catalog_id IS NOT NULL THEN
                        (
                            (SELECT c."isPublic" FROM catalog c WHERE c.id = "ActivityLog".target_catalog_id) IS TRUE
                            OR EXISTS (SELECT cu.catalog_id FROM user_catalog cu WHERE "ActivityLog".target_catalog_id = cu.catalog_id AND cu.user_id = "Follow".user_id)
                        )
                    END
                AND (
                    CASE
                        WHEN "ActivityLog".target_package_id IS NULL THEN TRUE
                        ELSE
                            (SELECT pkg."isPublic" FROM package pkg WHERE pkg.id = "ActivityLog".target_package_id) IS TRUE
                            OR EXISTS (SELECT pu.package_id FROM user_package_permission pu WHERE "ActivityLog".target_package_id = pu.package_id AND pu.user_id = "Follow".user_id)
                    END
                )`
            )
            .setParameter("userId", userId)
            .orderBy('"ActivityLog"."created_at"', "DESC")
            .offset(offset)
            .limit(limit)
            .addRelations(alias, relations)
            .getManyAndCount();
    }
}

const updatesQuery = `
        SELECT DISTINCT ON (a.id) a.*, u.username, u.first_name, u.last_name
        FROM activity_log a
        JOIN LATERAL (
            SELECT f.event_types, f.user_id, f.notification_frequency, f.target_catalog_id, f.target_package_id, f.target_collection_id, f.target_package_issue_id, f.target_user_id
            FROM follow f
            WHERE f.user_id = $1
            AND a.event_type IN (SELECT * FROM unnest(f.event_types))
            AND
            CASE
                WHEN f.target_collection_id IS NOT NULL THEN
                    (
                        (SELECT c.is_public FROM collection c WHERE c.id = a.target_collection_id) IS TRUE
                        OR EXISTS (SELECT cu.collection_id FROM collection_user cu WHERE a.target_collection_id = cu.collection_id AND cu.user_id = f.user_id)
                    )
                WHEN f.target_catalog_id IS NOT NULL THEN
                    (
                        (SELECT c."isPublic" FROM catalog c WHERE c.id = a.target_catalog_id) IS TRUE
                        OR EXISTS (SELECT cu.catalog_id FROM user_catalog cu WHERE a.target_catalog_id = cu.catalog_id AND cu.user_id = f.user_id)
                    )
                WHEN f.target_package_issue_id IS NOT NULL THEN
                    (
                        (SELECT c."isPublic" FROM catalog c WHERE c.id = a.target_catalog_id) IS TRUE
                        OR EXISTS (SELECT cu.catalog_id FROM user_catalog cu WHERE a.target_catalog_id = cu.catalog_id AND cu.user_id = f.user_id)
                    )
                END
                    AND (
                        CASE
                            WHEN a.target_package_id IS NULL THEN TRUE
                            WHEN a.target_package_id IS NOT NULL THEN
                                (SELECT pkg."isPublic" FROM package pkg WHERE pkg.id = a.target_package_id) IS TRUE
                                OR EXISTS (SELECT pu.package_id FROM user_package_permission pu WHERE a.target_package_id = pu.package_id AND pu.user_id = f.user_id
                            )
                        END
                    )
        ) f ON TRUE
        ORDER BY a.id DESC
        OFFSET $2
        LIMIT $3;
`;
