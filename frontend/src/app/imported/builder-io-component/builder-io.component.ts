import { AfterViewChecked, Component, ElementRef, Input } from "@angular/core";
import { Subject } from "rxjs";
import { takeUntil } from "rxjs/operators";
import { BuilderIOService } from "../resource-importer.service";

@Component({
    selector: "app-builder-io",
    templateUrl: "./builder-io.component.html",
    styleUrls: ["./builder-io.component.scss"]
})
export class BuilderIOComponent implements AfterViewChecked {
    private readonly JAVASCRIPT_ELEMENT_TYPE = "script";
    private readonly JAVASCRIPT_SCRIPT_TYPE = "text/javascript";

    @Input()
    public apiKey: string;

    @Input()
    public entry: string;

    public builderTemplate: string;

    private destroy$ = new Subject();

    constructor(private builderIOService: BuilderIOService, private elementRef: ElementRef) {}

    public ngAfterViewChecked(): void {
        this.loadJavascriptAndInjectIntoTemplate(this.apiKey, this.entry);
    }

    private loadJavascriptAndInjectIntoTemplate(apiKey: string, entry: string): void {
        this.builderIOService
            .getBuilderIOScript()
            .pipe(takeUntil(this.destroy$))
            .subscribe((js) => {
                this.apiKey = apiKey;
                this.entry = entry;
                this.injectJavascriptIntoTemplate(js);
            });
    }

    private injectJavascriptIntoTemplate(js: string): void {
        var script = document.createElement(this.JAVASCRIPT_ELEMENT_TYPE);
        script.type = this.JAVASCRIPT_SCRIPT_TYPE;
        script.innerHTML = js;
        this.elementRef.nativeElement.appendChild(script);
    }
}
