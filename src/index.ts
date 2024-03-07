import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { GCBMicroservice, GCBMicroserviceProps } from "./entities/RunService";
import { transform } from "@swc/core";
import { readFileSync } from "fs";

export * from "./entities/RunService";
export * from "./entities/Schedule";
export * from "./entities/Workflow";

export async function _cli() {
  const currentPath = process.env.PROJECT_DIR ?? process.cwd();
  const configFilePath = `${currentPath}/kdevops.ts`;
  console.log(`Running with config file: ${configFilePath}`);
  const contents = readFileSync(configFilePath, "utf-8");
  const compiled = await transform(contents, {
    jsc: {
      parser: {
        syntax: "typescript",
      },
    },
    module: {
      type: "commonjs",
    },
  });
  const config = eval(compiled.code).default as GCBMicroserviceProps;
  const service = new GCBMicroservice(config);
  await cli(service);
}

export async function cli(service: GCBMicroservice) {
  yargs(hideBin(process.argv))
    .command(
      "build",
      "build",
      () => {},
      async () => {
        await service.build();
      }
    )
    .command(
      "buildlocalarch",
      "build local architecture",
      () => {},
      () => {
        service.buildlocalarch();
      }
    )
    .command(
      "push",
      "push",
      () => {},
      () => {
        service.push();
      }
    )
    .command(
      "deploy",
      "deploy",
      () => {},
      () => {
        service.deploy();
      }
    )
    .command(
      "infra",
      "apply infrastructure",
      () => {},
      () => {
        service.apply();
      }
    )
    .command(
      "getenv",
      "get environment variables",
      () => {},
      () => {
        service.getenv();
      }
    )
    .command(
      "init",
      "initialize",
      () => {},
      () => {
        service.init();
      }
    )
    .command(
      "localrun",
      "run locally",
      () => {},
      () => {
        service.localrun();
      }
    )
    .strictCommands()
    .demandCommand(1)
    .parse();
}
