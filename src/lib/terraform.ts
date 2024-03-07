import { mkdirSync, writeFileSync } from "fs";

export class TFExpression {
  expression: string;

  constructor(expression: string) {
    this.expression = expression;
  }

  toString() {
    return this.expression;
  }
}

export abstract class TFRole {
  abstract toDict(): any;
}

interface TFServiceAccount {
  name: string;
}

export class TFProjectRole extends TFRole {
  role: string;
  projectId: string;

  constructor(role: string, projectId: string) {
    super();
    this.role = role;
    this.projectId = projectId;
  }

  toDict() {
    return {
      _resource: "google_project_iam_member",
      _name: this.role.replace(/\./g, "-").replace(/\//g, "-"),
      project: this.projectId,
      role: "roles/" + this.role,
    };
  }
}

export class TerraformFile {
  name: string;
  content: any[];

  constructor(name: string, content: any[] = []) {
    this.name = name;
    this.content = content;
  }

  addServiceAccount(name: string, roles: TFRole[]) {
    const terraformTypeMap = {
      run: "run.invoker",
      secretmanager: "secret_manager_secret",
      project: "project",
    };

    this.content.push({
      _resource: "google_service_account",
      _name: name,
      account_id: name,
      display_name: name,
    });

    for (const role of roles) {
      const data = role.toDict();
      data._name = name + "-" + data._name;
      data.member =
        "serviceAccount:${google_service_account." + name + ".email}";
      this.content.push(data);
    }
  }

  generateContents() {
    let result = "";
    for (const item of this.content) {
      result += dictToTerraform(null, item) + "\n\n\n";
    }
    return result;
  }
}

export class TerraformProject {
  files: TerraformFile[];

  constructor(files: TerraformFile[] = []) {
    this.files = files;
  }

  generateContents() {
    mkdirSync("terraform", { recursive: true });
    for (const file of this.files) {
      const path = `terraform/${file.name}.tf`;
      writeFileSync(path, file.generateContents());
    }
  }
}

export class TFSecretRole extends TFRole {
  secretName: string;
  role: string;

  constructor(
    secretName: string,
    role: string = "secretmanager.secretAccessor"
  ) {
    super();
    this.secretName = secretName;
    this.role = role;
  }

  toDict() {
    return {
      _resource: "google_secret_manager_secret_iam_member",
      _name: this.role.split(".").pop() + "-" + this.secretName,
      secret_id: new TFExpression(
        `google_secret_manager_secret.${this.secretName}.secret_id`
      ),
      role: "roles/" + this.role,
    };
  }
}

function terraformName(k: string | null, v: any) {
  if (typeof v === "object") {
    if (v._type) {
      if (v._name) {
        return `${v._type} "${v._name}"`;
      } else {
        return v._type;
      }
    } else if (v._resource) {
      return `resource "${v._resource}" "${v._name}"`;
    } else if (v._data) {
      return `data "${v._data}" "${v._name}"`;
    }
  }
  if (!k) {
    return null;
  }
  if (k.includes("-")) {
    return `"${k}"`;
  } else {
    return k;
  }
}

function dictToTerraform(key: string | null, value: any, indent: string = "") {
  const name = terraformName(key, value);
  const prefix = name ? `${indent}${name} = ` : `${indent}`;

  if (Array.isArray(value)) {
    let contents = "";
    contents = value
      .map((item) => dictToTerraform(null, item, indent + "  "))
      .join(",\n");
    return `${prefix}[\n${contents}\n${indent}]`;
  } else if (typeof value === "string") {
    const valj = JSON.stringify(value);
    return `${prefix}${valj}`;
  } else if (value instanceof TFExpression) {
    return `${prefix}${value}`;
  } else if (typeof value === "object") {
    if (!name) {
      throw new Error("No name");
    }
    let contents = "";
    for (const [k, v] of Object.entries(value)) {
      if (
        ["_type", "_resource", "_data", "_name", "_includeEquals"].includes(k)
      ) {
        continue;
      }
      contents += dictToTerraform(k, v, indent + "  ") + "\n";
    }
    const includeEquals = value._includeEquals;
    const j = includeEquals ? " = " : " ";
    return `${indent}${name}${j}{\n${contents}${indent}}`;
  } else {
    throw new Error(`Unknown type ${typeof value}`);
  }
}
