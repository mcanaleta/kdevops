import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { GCBMicroservice } from "./entities/RunService";

export * from "./entities/RunService";
export * from "./entities/Schedule";
export * from "./entities/Workflow";

/*
        cmd = sys.argv[1]
        if cmd == "build":
            self.build()
        if cmd == "buildlocalarch":
            self.buildlocalarch()
        if cmd == "push":
            self.push()
        if cmd == "deploy":
            self.deploy()
        if cmd == "infra":
            self.apply()
        elif cmd == "getenv":
            self.getenv()
        elif cmd == "init":
            self.init()
        elif cmd == "localrun":
            self.localrun()

            */
export function cli() {
  const currentPath = process.cwd();
  const configFilePath = `${currentPath}/kdevops.ts`;
  const config = require(configFilePath).default as GCBMicroservice;
  yargs(hideBin(process.argv))
    .command(
      "build",
      "build",
      () => {},
      async () => {
        await config.build();
      }
    )
    .command(
      "buildlocalarch",
      "build local architecture",
      () => {},
      () => {
        config.buildlocalarch();
      }
    )
    .command(
      "push",
      "push",
      () => {},
      () => {
        config.push();
      }
    )
    .command(
      "deploy",
      "deploy",
      () => {},
      () => {
        config.deploy();
      }
    )
    .command(
      "infra",
      "apply infrastructure",
      () => {},
      () => {
        config.apply();
      }
    )
    .command(
      "getenv",
      "get environment variables",
      () => {},
      () => {
        config.getenv();
      }
    )
    .command(
      "init",
      "initialize",
      () => {},
      () => {
        config.init();
      }
    )
    .command(
      "localrun",
      "run locally",
      () => {},
      () => {
        config.localrun();
      }
    )
    .strictCommands()
    .demandCommand(1)
    .parse();
}
