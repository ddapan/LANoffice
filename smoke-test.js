const { spawn } = require("node:child_process");

const child = spawn(process.execPath, ["server.js"], {
  cwd: __dirname,
  stdio: ["ignore", "pipe", "pipe"]
});

let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

async function waitForServer() {
  for (let i = 0; i < 30; i += 1) {
    try {
      const res = await fetch("http://localhost:8080");
      if (res.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`server did not start: ${stderr}`);
}

async function run() {
  await waitForServer();
  const login = await fetch("http://localhost:8080/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" })
  });
  if (!login.ok) throw new Error(`login failed: ${await login.text()}`);
  const cookie = login.headers.get("set-cookie");
  const files = await fetch("http://localhost:8080/api/files?path=%2F", {
    headers: { cookie }
  });
  if (files.status === 403) {
    const changed = await fetch("http://localhost:8080/api/password", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ password: "admin123" })
    });
    if (!changed.ok) throw new Error(`password change failed: ${await changed.text()}`);
  }
  const filesAfterPassword = files.status === 403
    ? await fetch("http://localhost:8080/api/files?path=%2F", { headers: { cookie } })
    : files;
  if (!filesAfterPassword.ok) throw new Error(`files failed: ${await filesAfterPassword.text()}`);
  console.log("smoke ok");
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    child.kill();
  });
