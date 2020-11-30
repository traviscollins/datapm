import { Component, Input, OnDestroy, OnInit } from "@angular/core";
import { MatDialog } from "@angular/material/dialog";
import { PackageFile, Schema } from "datapm-lib";
import { TableVirtualScrollDataSource } from "ng-table-virtual-scroll";

@Component({
    selector: "app-schema-samples",
    templateUrl: "./samples.component.html",
    styleUrls: ["./samples.component.scss"]
})
export class SamplesComponent implements OnInit, OnDestroy {
    @Input() public schema: Schema;

    public columns: string[];

    dataSource: TableVirtualScrollDataSource<{
        [key: string]: string;
    }>;

    constructor(private dialog: MatDialog) {}

    ngOnInit() {
        this.dataSource = new TableVirtualScrollDataSource(this.schemaSampleValues(this.schema));
        this.columns = Object.keys(this.schema.properties);
    }

    ngOnDestroy() {}

    schemaColumns(schema: Schema) {
        return Object.keys(schema.properties);
    }

    schemaSampleValues(schema: Schema) {
        if (schema == null) return [];

        return schema.sampleRecords?.map<{ [key: string]: string }>((r) => {
            const returnValue: { [key: string]: string } = {};

            for (const key of Object.keys(schema.properties)) {
                const value = r[key];
                if (value == null) {
                    returnValue[key] = null;
                    continue;
                }

                if (typeof value === "string") {
                    returnValue[key] = value;
                    continue;
                }
                if (typeof value === "number") {
                    returnValue[key] = (value as number).toString();
                    continue;
                }
            }

            return returnValue;
        });
    }
}