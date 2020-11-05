import { NgModule } from "@angular/core";
import { Routes, RouterModule } from "@angular/router";

import { MyAccountComponent } from "./my-account/my-account.component";
import { DetailsComponent } from "./details/details.component";
import { PackagesComponent } from "./packages/packages.component";
import { ActivityComponent } from "./activity/activity.component";
import { CatalogsComponent } from "./catalogs/catalogs.component";

const routes: Routes = [
    {
        path: "",
        component: MyAccountComponent,
        children: [
            {
                path: "details",
                component: DetailsComponent
            },
            {
                path: "packages",
                component: PackagesComponent
            },
            {
                path: "activity",
                component: ActivityComponent
            },
            {
                path: "catalogs",
                component: CatalogsComponent
            },
            {
                path: "**",
                redirectTo: "details"
            }
        ]
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class MyAccountRoutingModule {}
