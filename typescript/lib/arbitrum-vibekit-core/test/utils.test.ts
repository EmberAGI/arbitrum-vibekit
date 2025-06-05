import { expect } from "chai";
import { z, ZodTypeAny } from "zod";
import {
  getInputMimeType,
  UnsupportedSchemaError,
  formatToolDescriptionWithTagsAndExamples,
} from "../src/utils.js"; // Changed import path

describe("getInputMimeType", () => {
  describe("supported schemas", () => {
    it("should return text/plain for ZodString input", () => {
      const inputSchema = z.string();
      const result = getInputMimeType(inputSchema);
      expect(result).to.equal("text/plain");
    });

    it("should return application/json for ZodObject schemas", () => {
      const inputSchema = z.object({ name: z.string() });
      const result = getInputMimeType(inputSchema);
      expect(result).to.equal("application/json");
    });

    it("should return application/json for ZodArray schemas", () => {
      const inputSchema = z.array(z.string());
      const result = getInputMimeType(inputSchema);
      expect(result).to.equal("application/json");
    });
  });

  describe("unsupported schemas", () => {
    it("should throw UnsupportedSchemaError for ZodBoolean", () => {
      const inputSchema = z.boolean();
      expect(() => getInputMimeType(inputSchema as ZodTypeAny))
        .to.throw(UnsupportedSchemaError)
        .with.property("message", "ZodBoolean not supported");
    });

    it("should throw UnsupportedSchemaError for ZodNumber", () => {
      const inputSchema = z.number();
      expect(() => getInputMimeType(inputSchema as ZodTypeAny))
        .to.throw(UnsupportedSchemaError)
        .with.property("message", "ZodNumber not supported");
    });

    it("should throw UnsupportedSchemaError for ZodEnum", () => {
      const inputSchema = z.enum(["a", "b"]);
      expect(() => getInputMimeType(inputSchema as ZodTypeAny))
        .to.throw(UnsupportedSchemaError)
        .with.property("message", "ZodEnum not supported");
    });

    it("should throw UnsupportedSchemaError for ZodNativeEnum", () => {
      const TestEnum = { A: "a", B: "b" };
      const inputSchema = z.nativeEnum(TestEnum);
      expect(() => getInputMimeType(inputSchema as ZodTypeAny))
        .to.throw(UnsupportedSchemaError)
        .with.property("message", "ZodNativeEnum not supported");
    });

    it("should include skill name in error message when provided", () => {
      const inputSchema = z.boolean();
      const skillName = "TestSkill";
      expect(() => getInputMimeType(inputSchema as ZodTypeAny, skillName))
        .to.throw(UnsupportedSchemaError)
        .with.property(
          "message",
          'Skill "TestSkill": ZodBoolean not supported'
        );
    });
  });
});

describe("formatToolDescriptionWithTagsAndExamples", () => {
  it("should format description, tags, and examples into XML", () => {
    const description = "A tool for testing.";
    const tags = ["test", "utility"];
    const examples = ["Example 1", "Example 2"];
    const result = formatToolDescriptionWithTagsAndExamples(
      description,
      tags,
      examples
    );
    expect(result).to.include(description);
    expect(result).to.include("<tags><tag>test</tag><tag>utility</tag></tags>");
    expect(result).to.include(
      "<examples><example>Example 1</example><example>Example 2</example></examples>"
    );
  });

  it("should handle empty tags and examples arrays", () => {
    const description = "No tags or examples.";
    const tags: string[] = [];
    const examples: string[] = [];
    const result = formatToolDescriptionWithTagsAndExamples(
      description,
      tags,
      examples
    );
    expect(result).to.include(description);
    expect(result).to.include("<tags></tags>");
    expect(result).to.include("<examples></examples>");
  });

  it("should escape special XML characters in tags and examples", () => {
    const description = "Special chars";
    const tags = ["<tag>", '"quote"', "&amp;"];
    const examples = ["<example>", '"ex"', "&"];
    const result = formatToolDescriptionWithTagsAndExamples(
      description,
      tags,
      examples
    );
    expect(result).to.include(
      "<tags><tag>&lt;tag&gt;</tag><tag>&quot;quote&quot;</tag><tag>&amp;amp;</tag></tags>"
    );
    expect(result).to.include(
      "<examples><example>&lt;example&gt;</example><example>&quot;ex&quot;</example><example>&amp;</example></examples>"
    );
  });

  it("should handle a large number of tags and examples", () => {
    const description = "Many tags/examples";
    const tags = Array.from({ length: 50 }, (_, i) => `tag${i}`);
    const examples = Array.from({ length: 50 }, (_, i) => `ex${i}`);
    const result = formatToolDescriptionWithTagsAndExamples(
      description,
      tags,
      examples
    );
    expect(result).to.include("<tag>tag0</tag>");
    expect(result).to.include("<tag>tag49</tag>");
    expect(result).to.include("<example>ex0</example>");
    expect(result).to.include("<example>ex49</example>");
  });

  it("should handle whitespace and empty strings in tags/examples", () => {
    const description = "Whitespace test";
    const tags = [" ", "", "tag"];
    const examples = ["", "  ", "ex"];
    const result = formatToolDescriptionWithTagsAndExamples(
      description,
      tags,
      examples
    );
    expect(result).to.include("<tag> </tag><tag></tag><tag>tag</tag>");
    expect(result).to.include(
      "<example></example><example>  </example><example>ex</example>"
    );
  });

  it("should handle unicode characters in tags/examples", () => {
    const description = "Unicode test";
    const tags = ["测试", "тест", "テスト"];
    const examples = ["例子", "пример", "サンプル"];
    const result = formatToolDescriptionWithTagsAndExamples(
      description,
      tags,
      examples
    );
    expect(result).to.include("<tag>测试</tag>");
    expect(result).to.include("<tag>тест</tag>");
    expect(result).to.include("<tag>テスト</tag>");
    expect(result).to.include("<example>例子</example>");
    expect(result).to.include("<example>пример</example>");
    expect(result).to.include("<example>サンプル</example>");
  });

  it("should include description with newlines and special characters", () => {
    const description = "Line1\nLine2 <&>";
    const tags = ["tag"];
    const examples = ["ex"];
    const result = formatToolDescriptionWithTagsAndExamples(
      description,
      tags,
      examples
    );
    expect(result).to.include("Line1\nLine2 <&>");
    expect(result).to.include("<tag>tag</tag>");
    expect(result).to.include("<example>ex</example>");
  });
});
