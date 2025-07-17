import { render } from "@testing-library/react";
import Sidebar from "../Sidebar";

describe("Sidebar (Demo UI)", () => {
  it("renders with minimal required props", () => {
    render(
      <Sidebar
        connectionStatus="disconnected"
        onConnect={() => {}}
        onDisconnect={() => {}}
      />,
    );
  });
});
