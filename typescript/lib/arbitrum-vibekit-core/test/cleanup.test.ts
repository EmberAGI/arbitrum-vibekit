import { closeServer } from "ember-mcp-tool-server";

after(async () => {
  await closeServer();
});
