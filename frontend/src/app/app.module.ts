import { BrowserModule } from "@angular/platform-browser";
import { NgModule } from "@angular/core";
import { HttpClientModule } from "@angular/common/http";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";

import { AppRoutingModule } from "./app-routing.module";
import { AppComponent } from "./app.component";
import { GraphQLModule } from "./graphql.module";
import { MaterialModule } from "./material.module";
import { SharedModule } from "./shared/shared.module";

@NgModule({
    declarations: [AppComponent],
    imports: [
        BrowserModule,
        BrowserAnimationsModule,
        AppRoutingModule,
        GraphQLModule,
        HttpClientModule,
        ReactiveFormsModule,
        FormsModule,
        SharedModule,
        MaterialModule
    ],
    providers: [],
    bootstrap: [AppComponent],
    entryComponents: [],
    schemas: []
})
export class AppModule {}
