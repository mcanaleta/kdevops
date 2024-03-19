import { execFileSync } from "child_process";
import { cloudbuild_generate } from "../lib/cloudbuild";
import {
  TerraformFile,
  TerraformProject,
  TFExpression,
  TFProjectRole,
  TFSecretRole,
} from "../lib/terraform";
import { GCBSchedule } from "./Schedule";
import { GCBWorkflow } from "./Workflow";
import { run, runReturn } from "../lib/cmds";
import { cli } from "..";
import { writeFileSync } from "fs";
import { join, relative } from "path";

export type GCBMicroserviceProps = {
  project_id: string;
  name: string;
  terraform_bucket: string;
  terraform_prefix: string;
  domain?: string;
  env?: Record<string, string>;
  env_prod?: Record<string, string>;
  secrets?: Record<string, string>;
  service_account?: string;
  schedules?: GCBSchedule[];
  workflows?: GCBWorkflow[];
  project_roles?: string[];
  isPublic?: boolean;
  region?: string;
  registry_region?: string;
  scheduler_region?: string;
  cpu?: string;
  memory?: string;
  github_user: string;
  github_repo: string;
  cloudbuild_region?: string;
  server_root?: string;
};

export class GCBMicroservice {
  public project_id: string;
  public name: string;
  public terraform_bucket: string;
  public terraform_prefix: string;
  public domain?: string;
  public env: Record<string, string>;
  public env_prod: Record<string, string>;
  public secrets: Record<string, string>;
  public service_account?: string;
  public schedules: GCBSchedule[];
  public workflows: GCBWorkflow[];
  public project_roles: string[];
  public isPublic: boolean;
  public region: string;
  public registry_region: string;
  public scheduler_region: string;
  public cpu: string;
  public memory: string;
  public github_user: string;
  public github_repo: string;
  public cloudbuild_region: string;
  public registry: string;
  public server_root: string;
  public image_name: string;
  public image_url: string;
  public image_url_latest: string;
  public localarch_image_url: string;
  public sa_cloudbuild: string;
  public sa_scheduler: string;

  constructor(props: GCBMicroserviceProps) {
    this.project_id = props.project_id;
    this.name = props.name;
    this.terraform_bucket = props.terraform_bucket;
    this.terraform_prefix = props.terraform_prefix;
    this.domain = props.domain;
    this.env = props.env ?? {};
    this.env_prod = props.env_prod ?? {};
    this.secrets = props.secrets ?? {};
    this.service_account = props.service_account;
    this.schedules = props.schedules ?? [];
    this.workflows = props.workflows ?? [];
    this.project_roles = props.project_roles ?? [];
    this.isPublic = props.isPublic ?? true;
    this.region = props.region ?? "europe-west1";
    this.registry_region = props.registry_region ?? "europe";
    this.scheduler_region = props.scheduler_region ?? "europe-west1";
    this.cpu = props.cpu ?? "1000m";
    this.memory = props.memory ?? "1G";
    this.github_user = props.github_user;
    this.github_repo = props.github_repo;
    this.cloudbuild_region = props.cloudbuild_region ?? "europe-west1";
    this.registry = `${this.registry_region}-docker.pkg.dev`;
    this.server_root = props.server_root ?? ".";
    this.image_name = this.name;
    this.image_url = `${this.registry}/${this.project_id}/${this.image_name}/${this.image_name}`;
    this.image_url_latest = `${this.image_url}:latest`;
    this.localarch_image_url = `${this.image_name}_localarch`;
    this.sa_cloudbuild = `${this.name}-cloudbuild`;
    this.sa_scheduler = `${this.name}-scheduler`;
  }

  // Rest of the code...

  init(): void {
    this.generate();
    // run terraform init in folder ./terraform/
  }

  apply(): void {
    console.log("Generating infra");
    this.generate();
    // run terraform apply in folder ./terraform/
  }

  generate(): void {
    this.generate_terraform();
    this.generate_cloudbuild();
  }

  generate_terraform(): void {
    const project = new TerraformProject();
    project.files.push(this.generate_main());
    project.files.push(this.generate_secrets());
    project.files.push(this.generate_iam());
    project.files.push(this.generate_ci());
    project.files.push(this.generate_cloudrun());
    project.files.push(this.generate_google_services());
    project.files.push(this.generate_schedules());
    project.generateContents();
  }

  generate_cloudbuild(): void {
    cloudbuild_generate(this);
  }

  generate_main(): TerraformFile {
    const base = new TerraformFile("main");
    base.content.push({
      _type: "terraform",
      required_providers: {
        google: {
          _includeEquals: true,
          source: "hashicorp/google",
        },
      },
      backend_gcs: {
        _type: "backend",
        _name: "gcs",
        bucket: this.terraform_bucket,
        prefix: this.terraform_prefix,
      },
    });

    base.content.push({
      _type: "provider",
      _name: "google",
      project: this.project_id,
      region: this.region,
    });

    return base;
  }

  generate_google_services(): TerraformFile {
    const google_services = [
      "artifactregistry",
      "run",
      "cloudbuild",
      "secretmanager",
      "iam",
      "cloudscheduler",
      "sheets",
    ];

    const file = new TerraformFile("google_services");
    for (const service of google_services) {
      file.content.push({
        _resource: "google_project_service",
        _name: service,
        project: this.project_id,
        service: `${service}.googleapis.com`,
        disable_on_destroy: "false",
      });
    }
    return file;
  }

  generate_secrets(): TerraformFile {
    const secrets = new TerraformFile("secrets");
    for (const [k, v] of Object.entries(this.secrets)) {
      secrets.content.push({
        _resource: "google_secret_manager_secret",
        _name: v,
        secret_id: v,
        replication: { auto: {} },
        depends_on: [new TFExpression("google_project_service.secretmanager")],
        lifecycle: {
          prevent_destroy: "true",
        },
      });
    }

    return secrets;
  }

  generate_ci(): TerraformFile {
    const ci = new TerraformFile("ci");
    ci.content.push({
      _resource: "google_artifact_registry_repository",
      _name: this.name,
      location: this.registry_region,
      repository_id: this.name,
      format: "DOCKER",
      depends_on: [new TFExpression("google_project_service.artifactregistry")],
    });

    const repo = this.github_repo || this.name;
    ci.content.push({
      _resource: "google_cloudbuildv2_repository",
      _name: this.name,
      location: this.cloudbuild_region,
      name: repo,
      parent_connection: "github",
      remote_uri: `https://github.com/${this.github_user}/${repo}.git`,
    });

    ci.content.push({
      _resource: "google_cloudbuild_trigger",
      _name: this.name,
      name: this.name,
      location: this.cloudbuild_region,
      filename: "cloudbuild.yaml",
      service_account: `projects/${this.project_id}/serviceAccounts/\${google_service_account.${this.sa_cloudbuild}.email}`,
      repository_event_config: {
        repository: new TFExpression(
          `google_cloudbuildv2_repository.${this.name}.id`
        ),
        push: { branch: "^main$" },
      },
    });
    return ci;
  }

  generate_cloudrun(): TerraformFile {
    const file = new TerraformFile("cloudrun");

    const service = {
      _resource: "google_cloud_run_v2_service",
      _name: this.name,
      name: this.name,
      location: this.region,
      template: {
        containers: {
          image: `${this.image_url}:latest`,
          resources: {
            limits: {
              _includeEquals: true,
              cpu: this.cpu,
              memory: this.memory,
            },
            cpu_idle: new TFExpression("true"),
          },
        },
        service_account: new TFExpression(
          `google_service_account.${this.name}.email`
        ),
      },
      lifecycle: {
        ignore_changes: [
          new TFExpression("template[0].containers[0].image"),
          new TFExpression("client"),
          new TFExpression("client_version"),
        ],
      },
    };

    for (const [k, v] of Object.entries(this.secrets)) {
      service.template.containers[`env_scret${k}`] = {
        _type: "env",
        name: k,
        value_source: {
          secret_key_ref: {
            secret: new TFExpression(
              `google_secret_manager_secret.${v}.secret_id`
            ),
            version: "latest",
          },
        },
      };
    }

    const merged_env = { ...this.env, ...this.env_prod };
    for (const [k, v] of Object.entries(merged_env)) {
      service.template.containers[`env${k}`] = {
        _type: "env",
        name: k,
        value: v,
      };
    }

    const policyName = `${this.name}_run_noauth`;

    file.content.push({
      _data: "google_iam_policy",
      _name: policyName,
      binding: { role: "roles/run.invoker", members: ["allUsers"] },
    });

    if (this.isPublic) {
      file.content.push({
        _resource: "google_cloud_run_v2_service_iam_policy",
        _name: policyName,
        project: this.project_id,
        location: new TFExpression(
          `google_cloud_run_v2_service.${this.name}.location`
        ),
        name: new TFExpression(`google_cloud_run_v2_service.${this.name}.name`),
        policy_data: new TFExpression(
          `data.google_iam_policy.${policyName}.policy_data`
        ),
      });
    }

    file.content.push(service);
    if (this.domain) {
      const domain_mapping = {
        _resource: "google_cloud_run_domain_mapping",
        _name: this.name,
        location: this.region,
        name: this.domain,
        spec: {
          route_name: new TFExpression(
            `google_cloud_run_v2_service.${this.name}.name`
          ),
        },
        metadata: {
          namespace: this.project_id,
        },
        depends_on: [
          new TFExpression(`google_cloud_run_v2_service.${this.name}`),
        ],
      };
      file.content.push(domain_mapping);
    }
    return file;
  }

  generate_iam(): TerraformFile {
    const iam = new TerraformFile("iam");

    iam.addServiceAccount(this.name, [
      ...this.project_roles.map((r) => new TFProjectRole(r, this.project_id)),
      ...Object.values(this.secrets).map((s) => new TFSecretRole(s)),
    ]);

    iam.content.push({
      _resource: "google_service_account_key",
      _name: this.name,
      service_account_id: new TFExpression(
        `google_service_account.${this.name}.id`
      ),
    });

    iam.content.push({
      _resource: "local_file",
      _name: `${this.name}_key`,
      filename: `${this.name}-key.json`,
      content: new TFExpression(
        `base64decode(google_service_account_key.${this.name}.private_key)`
      ),
    });

    iam.addServiceAccount(this.sa_cloudbuild, [
      new TFProjectRole("run.developer", this.project_id),
      new TFProjectRole("cloudbuild.builds.editor", this.project_id),
      new TFProjectRole("logging.logWriter", this.project_id),
      new TFProjectRole("artifactregistry.writer", this.project_id),
      new TFProjectRole("iam.serviceAccountUser", this.project_id),
    ]);

    iam.addServiceAccount(this.sa_scheduler, [
      new TFProjectRole("run.invoker", this.project_id),
    ]);
    return iam;
  }

  generate_schedules(): TerraformFile {
    const schedules = new TerraformFile("schedules");
    for (const schedule of this.schedules) {
      const bodyjson = JSON.stringify(schedule.body);
      const bodydoublejson = JSON.stringify(bodyjson);
      const bodyexpression = `base64encode(${bodydoublejson})`;
      schedules.content.push({
        _resource: "google_cloud_scheduler_job",
        _name: schedule.name,
        name: schedule.name,
        schedule: schedule.frequency,
        time_zone: "Europe/Madrid",
        region: this.scheduler_region,
        http_target: {
          http_method: "POST",
          uri: new TFExpression(
            `"\${google_cloud_run_v2_service.${this.name}.uri}/${schedule.path}"`
          ),
          body: new TFExpression(bodyexpression),
          headers: {
            _includeEquals: true,
            "Content-Type": "application/json",
          },
          oidc_token: {
            service_account_email: new TFExpression(
              `google_service_account.${this.sa_scheduler}.email`
            ),
          },
        },
        depends_on: [
          new TFExpression(`google_cloud_run_v2_service.${this.name}`),
          new TFExpression(`google_project_service.cloudscheduler`),
        ],
      });
    }
    return schedules;
  }

  async getenv() {
    console.log("getenv");
    //   with open(f"{self.server_root}/.env.local", "w") as f, open(
    //     "./.env.local.docker", "w"
    // ) as fd:
    //     for k, v in self.env.items():
    //         f.write(f"{k}={v}\n")
    //         fd.write(f"{k}={v}\n")
    //     for k, v in self.secrets.items():
    //         cmd = f"gcloud secrets versions access latest --secret={v} --project={self.project_id}"
    //         value = subprocess.check_output(cmd.split()).decode().strip()
    //         f.write(f"{k}={value}\n")
    //         fd.write(f"{k}={value}\n")
    //     creds_path = f"./terraform/{self.name}-key.json"
    //     rel_path = Path(creds_path).relative_to(self.server_root, walk_up=True)
    //     f.write(f"GOOGLE_APPLICATION_CREDENTIALS={rel_path}\n")
    //     fd.write(f"GOOGLE_APPLICATION_CREDENTIALS=/app/{self.name}-key.json\n")
    const envLocal = [] as string[];
    const envDocker = [] as string[];
    for (const [k, v] of Object.entries(this.env)) {
      envLocal.push(`${k}=${v}`);
      envDocker.push(`${k}=${v}`);
    }
    for (const [k, v] of Object.entries(this.secrets)) {
      const value = await runReturn(
        "gcloud",
        `secrets versions access latest --secret=${v} --project=${this.project_id}`.split(
          " "
        )
      );
      envLocal.push(`${k}=${value}`);
      envDocker.push(`${k}=${value}`);
    }
    const creds_path = `./terraform/${this.name}-key.json`;
    const rel_path = relative(this.server_root, creds_path);
    envLocal.push(`GOOGLE_APPLICATION_CREDENTIALS=${rel_path}`);
    envDocker.push(`GOOGLE_APPLICATION_CREDENTIALS=/app/${this.name}-key.json`);

    writeFileSync(`${this.server_root}/.env.local`, envLocal.join("\n"));
    writeFileSync(`.env.local.docker`, envDocker.join("\n"));
  }

  async build(tag?: string) {
    tag = tag ?? `local${Math.floor(Date.now() / 1000)}`;
    const image_url_tag = `${this.image_url}:${tag}`;
    await run("docker", [
      "buildx",
      "build",
      "--progress",
      "plain",
      "--platform",
      "linux/amd64",
      "-t",
      image_url_tag,
      "-t",
      this.image_url_latest,
      ".",
    ]);
    return tag;
  }

  async buildlocalarch() {
    await run("docker", [
      "build",
      "--progress",
      "plain",
      "-t",
      this.localarch_image_url,
      ".",
    ]);
    return this.localarch_image_url;
  }

  async push(tag?: string) {
    tag = await this.build(tag);
    const image_url_tag = `${this.image_url}:${tag}`;
    await run("docker", ["push", image_url_tag]);
    await run("docker", ["push", this.image_url_latest]);
    return tag;
  }

  async deploy() {
    const tag = await this.push();
    const image_url_tag = `${this.image_url}:${tag}`;
    await run("gcloud", [
      "run",
      "services",
      "update",
      this.name,
      "--image=" + image_url_tag,
      "--region=" + this.region,
      "--project=" + this.project_id,
    ]);
    // Implementation for the `deploy` method
  }

  async localrun() {
    const tag = await this.buildlocalarch();
    await run("docker", [
      "run",
      "--rm",
      "-p",
      "8080:8080",
      "--env-file",
      "./.env.local.docker",
      "-v",
      `./terraform/${this.name}-key.json:/app/${this.name}-key.json`,
      "backoffice_localarch",
    ]);
  }

  main(): void {
    const cmd = process.argv[2];
    if (cmd === "build") {
      this.build();
    }
    if (cmd === "buildlocalarch") {
      this.buildlocalarch();
    }
    if (cmd === "push") {
      this.push();
    }
    if (cmd === "deploy") {
      this.deploy();
    }
    if (cmd === "infra") {
      this.apply();
    } else if (cmd === "getenv") {
      this.getenv();
    } else if (cmd === "init") {
      this.init();
    } else if (cmd === "localrun") {
      this.localrun();
    }
  }

  cli() {
    return cli(this);
  }
}
