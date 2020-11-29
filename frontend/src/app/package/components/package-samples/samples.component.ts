import { Component, Input, OnDestroy, OnInit, ChangeDetectionStrategy, ViewEncapsulation } from "@angular/core";
import { MatDialog } from "@angular/material/dialog";
import { PackageFile, Schema } from "datapm-lib";
import { createDS, columnFactory } from "@pebula/ngrid";

enum State {
    LOGGED_OUT,
    AWAITING_RESPONSE,
    INCORRECT_LOGIN,
    LOGGED_IN,
    LOGIN_ERROR,
    LOGIN_ERROR_VALIDATE_EMAIL
}

@Component({
    selector: "app-schema-samples",
    templateUrl: "./samples.component.html",
    styleUrls: ["./samples.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None
})
export class SamplesComponent implements OnInit, OnDestroy {
    State = State;

    @Input() public schema: Schema;

    columns;

    constructor(private dialog: MatDialog) {}

    public ds;

    ngOnInit() {
        this.columns = columnFactory()
            .default({ minWidth: 100 })
            .table(
                ...Object.keys(this.schema.properties).map((k) => {
                    return {
                        prop: k
                    };
                })
            )
            .build();
        this.ds = this.createDatasource();
    }

    ngOnDestroy() {}

    removeDatasource(): void {
        if (this.ds) {
            this.ds.dispose();
            this.ds = undefined;
        }
    }

    createDatasource() {
        return createDS<{
            [key: string]: string;
        }>()
            .onTrigger(() => this.schemaSampleValues(this.schema))
            .create();
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
