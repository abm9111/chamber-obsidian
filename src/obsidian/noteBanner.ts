import type ChamberDriftPlugin from "../main";
export class NoteBanner {
  constructor(private plugin: ChamberDriftPlugin) {}
  start(): void {}
  detach(): void {}
}
