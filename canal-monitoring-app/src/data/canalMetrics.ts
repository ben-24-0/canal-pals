export const canalMetrics: Record<
  string,
  {
    status: "FLOWING" | "STOPPED";
    flowRate: number;
    speed: number;
    discharge: number;
  }
> = {
  "peechi-canal": {
    status: "FLOWING",
    flowRate: 14.2,
    speed: 1.8,
    discharge: 520,
  },
  "canoli-canal": {
    status: "STOPPED",
    flowRate: 0,
    speed: 0,
    discharge: 0,
  },
  "puthussery-kalady-canal": {
    status: "FLOWING",
    flowRate: 9.6,
    speed: 1.2,
    discharge: 340,
  },
};
