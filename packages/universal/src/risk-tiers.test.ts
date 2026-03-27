import { describe, it, expect } from "vitest";
import { classifyTool } from "./risk-tiers.js";

describe("classifyTool", () => {
  it("classifies read-only tools as low risk", () => {
    expect(classifyTool("get_weather")).toBe("low");
    expect(classifyTool("list_files")).toBe("low");
    expect(classifyTool("search_documents")).toBe("low");
    expect(classifyTool("fetch_user")).toBe("low");
    expect(classifyTool("read_config")).toBe("low");
    expect(classifyTool("query_database")).toBe("low");
    expect(classifyTool("check_status")).toBe("low");
    expect(classifyTool("view_dashboard")).toBe("low");
  });

  it("classifies write/send/delete tools as high risk", () => {
    expect(classifyTool("send_email")).toBe("high");
    expect(classifyTool("delete_user")).toBe("high");
    expect(classifyTool("write_file")).toBe("high");
    expect(classifyTool("deploy_service")).toBe("high");
    expect(classifyTool("merge_branch")).toBe("high");
    expect(classifyTool("grant_permission")).toBe("high");
    expect(classifyTool("execute_command")).toBe("high");
    expect(classifyTool("transfer_funds")).toBe("high");
  });

  it("defaults unknown tools to high risk", () => {
    expect(classifyTool("some_unknown_tool")).toBe("high");
    expect(classifyTool("foobar")).toBe("high");
  });

  it("respects user overrides", () => {
    expect(classifyTool("send_email", { send_email: "low" })).toBe("low");
    expect(classifyTool("get_weather", { get_weather: "high" })).toBe("high");
  });
});
