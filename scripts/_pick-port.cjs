// Print the first bindable TCP port (on 127.0.0.1) among the given candidates,
// or exit 1 if none are free. Used by the installer to pick ports that won't
// collide — no matter what else is running on the machine.
const net = require("net");

const ports = process.argv.slice(2).map(Number).filter((n) => Number.isInteger(n) && n > 0);

(async () => {
  for (const p of ports) {
    const free = await new Promise((resolve) => {
      const s = net.createServer();
      s.once("error", () => resolve(false));
      s.listen(p, "127.0.0.1", () => s.close(() => resolve(true)));
    });
    if (free) {
      process.stdout.write(String(p));
      process.exit(0);
    }
  }
  process.exit(1);
})();
