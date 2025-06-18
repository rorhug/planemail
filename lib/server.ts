import http from "http";
import url from "url";
import open from "open";
import net from "net";

function findFreePort(start: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => {
      resolve(findFreePort(start + 1));
    });
    server.listen(start, () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

export function getOAuthCode(authUrl: string): Promise<string> {
  return new Promise(async (resolve, reject) => {
    const port = await findFreePort(8989);
    const server = http
      .createServer((req, res) => {
        if (!req.url) {
          res.end("Invalid request.");
          return;
        }
        const { code } = url.parse(req.url, true).query;
        if (code) {
          res.end(
            "<h1>Authenticated!</h1><p>You can close this window and return to your terminal.</p>"
          );
          server.close();
          resolve(code as string);
        } else {
          res.end("No code found in URL.");
          reject(new Error("Authentication failed. No code provided."));
        }
      })
      .listen(port);

    await open(authUrl);
  });
}
