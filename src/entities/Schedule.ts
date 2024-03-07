export class GCBSchedule {
  constructor(
    public name: string,
    public path: string,
    public frequency: string,
    public body: Record<string, any>
  ) {}
}
