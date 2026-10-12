/**
 * Firma «ad hoc» completa de la app (la app y todos sus Helpers).
 * Sin una firma válida, macOS no recuerda el permiso de la cámara y lo
 * vuelve a pedir cada vez.
 */
const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  execFileSync(
    "codesign",
    [
      "--force",
      "--deep",
      "--sign",
      "-",
      "--identifier",
      "com.nakamacar.estimate.mac",
      app,
    ],
    { stdio: "inherit" },
  );
  execFileSync(
    "codesign",
    ["--verify", "--deep", "--strict", "--verbose=2", app],
    {
      stdio: "inherit",
    },
  );
};
