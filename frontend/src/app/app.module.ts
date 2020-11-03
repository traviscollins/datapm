import { BrowserModule } from "@angular/platform-browser";
import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from "@angular/core";
import { HttpClientModule } from "@angular/common/http";
import { FormsModule } from "@angular/forms";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";

import { AppRoutingModule } from "./app-routing.module";
import { AppComponent } from "./app.component";
import { GraphQLModule } from "./graphql.module";
import { CatalogDetailsComponent } from "./catalog-details/catalog-details.component";
import { ReactiveFormsModule } from "@angular/forms";
import { MyAccountComponent } from "./my-account/my-account.component";
import { PackageDetailComponent } from "./package/package-detail/package-detail.component";
import { MaterialModule } from "./material.module";
import { SharedModule } from "./shared/shared.module";
import { LoginDialogComponent } from "./shared/header/login-dialog/login-dialog.component";
import { SignUpDialogComponent } from "./shared/header/sign-up-dialog/sign-up-dialog.component";
import { ForgotPasswordDialogComponent } from "./shared/header/forgot-password-dialog/forgot-password-dialog.component";
import { SearchComponent } from "./search/search.component";
import { PackageComponent } from "./package/package.component";
import { PackageVersionComponent } from "./package/package-version/package-version.component";
import { PackageSchemaComponent } from "./package/package-schema/package-schema.component";
import { DetailsComponent } from "./my-account/details/details.component";
import { PackagesComponent } from "./my-account/packages/packages.component";
import { ActivityComponent } from "./my-account/activity/activity.component";
import { CatalogsComponent } from "./my-account/catalogs/catalogs.component";

import { EditAccountDialogComponent } from "./my-account/edit-account-dialog/edit-account-dialog.component";
import { EditPasswordDialogComponent } from "./my-account/edit-password-dialog/edit-password-dialog.component";
import { ConfirmationDialogComponent } from "./my-account/confirmation-dialog/confirmation-dialog.component";
@NgModule({
    declarations: [
        AppComponent,
        CatalogDetailsComponent,
        MyAccountComponent,
        PackageDetailComponent,
        LoginDialogComponent,
        SignUpDialogComponent,
        ForgotPasswordDialogComponent,
        SearchComponent,
        PackageComponent,
        PackageVersionComponent,
        PackageSchemaComponent,
        DetailsComponent,
        PackagesComponent,
        ActivityComponent,
        CatalogsComponent,
        EditAccountDialogComponent,
        EditPasswordDialogComponent,
        ConfirmationDialogComponent
    ],
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
    entryComponents: [LoginDialogComponent, SignUpDialogComponent],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class AppModule {}
