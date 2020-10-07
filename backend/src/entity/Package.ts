import {
  Entity,
  Column,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

import { BaseModel } from "./BaseModel";
import { Catalog } from "./Catalog";
import { Version } from "./Version";
import { PackageIdentifier } from "../generated/graphql";
import { User } from "./User";

@Entity({
  name: "package",
})
@Unique(["slug","catalogId"])
export class Package extends BaseModel {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    nullable: true,
    name: "slug",
    length: 256,
    type: "varchar",
  })
  slug: string

  @Column({
    nullable: true,
    name: "displayName",
    length: 256,
    type: "varchar",
  })
  displayName: string

  @Column({
    name: "description",
    nullable: true,
    type: "text"
  })
  description: string | null

  // @ManyToOne(() => User)
  // @JoinColumn({ name: "managed_by_id" })
  // creator: User;

  // @Column({ name: "managed_by_id"})
  // creatorId: number;

  @ManyToOne(() => Catalog)
  @JoinColumn({ name: "catalog_id" })
  catalog: Catalog;

  @Column({ name: "catalog_id" })
  catalogId: number;

  @Column({nullable: false, default: true})
  isActive: boolean;

  @Column({nullable: false, default: false})
  isPublic: boolean;

  @OneToMany(() => Version, (version) => version.package, { })
  @JoinColumn({ name: "catalog_id" })
  versions: Version[];


  /** These are dummy values that are filled in by graphql responses */
  latestVersion:Version;

  identifier: PackageIdentifier;

}
