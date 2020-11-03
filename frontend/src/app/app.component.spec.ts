import { TestBed, async } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { RouterTestingModule } from "@angular/router/testing";
import { AppComponent } from "./app.component";
import { MaterialModule } from "./material.module";
import { SharedModule } from "./shared/shared.module";

describe("AppComponent", () => {
    beforeEach(async(() => {
        TestBed.configureTestingModule({
            imports: [
                RouterTestingModule.withRoutes([{ path: "", component: AppComponent }]),
                MaterialModule,
                ReactiveFormsModule,
                SharedModule
            ],
            declarations: [AppComponent]
        }).compileComponents();
    }));

    beforeEach(async(() => {
        TestBed.configureTestingModule({
            imports: [RouterTestingModule, MaterialModule, ReactiveFormsModule, SharedModule],
            declarations: [AppComponent]
        }).compileComponents();
    }));

    it(`should have as title 'datapm-registry-frontend'`, () => {
        const fixture = TestBed.createComponent(AppComponent);
        const app = fixture.componentInstance;
        expect(app.title).toEqual("datapm-registry-frontend");
    });

    // it('should render title', () => {
    //   const fixture = TestBed.createComponent(AppComponent);
    //   fixture.detectChanges();
    //   const compiled = fixture.nativeElement;
    //   expect(compiled.querySelector('.title').textContent).toContain('datapm');
    // });
});
