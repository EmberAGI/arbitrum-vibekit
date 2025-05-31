import { expect } from "chai";
import { z } from "zod";
import {
  getMimeTypesFromZodSchema,
  UnsupportedSchemaError,
} from "../dist/utils.js";

describe("getMimeTypesFromZodSchema", () => {
  describe("supported schemas", () => {
    it("should return text/plain for ZodString input and output", () => {
      const inputSchema = z.string();
      const outputSchema = z.string();

      const result = getMimeTypesFromZodSchema(inputSchema, outputSchema);

      expect(result).to.deep.equal({
        inputMimeType: "text/plain",
        outputMimeType: "text/plain",
      });
    });

    it("should return application/json for ZodObject schemas", () => {
      const inputSchema = z.object({ name: z.string() });
      const outputSchema = z.object({ result: z.string() });

      const result = getMimeTypesFromZodSchema(inputSchema, outputSchema);

      expect(result).to.deep.equal({
        inputMimeType: "application/json",
        outputMimeType: "application/json",
      });
    });

    it("should return application/json for ZodArray schemas", () => {
      const inputSchema = z.array(z.string());
      const outputSchema = z.array(z.number());

      const result = getMimeTypesFromZodSchema(inputSchema, outputSchema);

      expect(result).to.deep.equal({
        inputMimeType: "application/json",
        outputMimeType: "application/json",
      });
    });

    it("should handle mixed string and object schemas", () => {
      const inputSchema = z.string();
      const outputSchema = z.object({ data: z.string() });

      const result = getMimeTypesFromZodSchema(inputSchema, outputSchema);

      expect(result).to.deep.equal({
        inputMimeType: "text/plain",
        outputMimeType: "application/json",
      });
    });
  });

  describe("unsupported schemas", () => {
    it("should throw UnsupportedSchemaError for ZodBoolean input schema", () => {
      const inputSchema = z.boolean();
      const outputSchema = z.string();

      expect(() => getMimeTypesFromZodSchema(inputSchema, outputSchema))
        .to.throw(UnsupportedSchemaError)
        .with.property("message", "ZodBoolean not supported");
    });

    it("should throw UnsupportedSchemaError for ZodNumber input schema", () => {
      const inputSchema = z.number();
      const outputSchema = z.string();

      expect(() => getMimeTypesFromZodSchema(inputSchema, outputSchema))
        .to.throw(UnsupportedSchemaError)
        .with.property("message", "ZodNumber not supported");
    });

    it("should throw UnsupportedSchemaError for ZodEnum input schema", () => {
      const inputSchema = z.enum(["option1", "option2"]);
      const outputSchema = z.string();

      expect(() => getMimeTypesFromZodSchema(inputSchema, outputSchema))
        .to.throw(UnsupportedSchemaError)
        .with.property("message", "ZodEnum not supported");
    });

    it("should throw UnsupportedSchemaError for ZodNativeEnum input schema", () => {
      const TestEnum = { A: "a", B: "b" };
      const inputSchema = z.nativeEnum(TestEnum);
      const outputSchema = z.string();

      expect(() => getMimeTypesFromZodSchema(inputSchema, outputSchema))
        .to.throw(UnsupportedSchemaError)
        .with.property("message", "ZodNativeEnum not supported");
    });

    it("should throw UnsupportedSchemaError for ZodBoolean output schema", () => {
      const inputSchema = z.string();
      const outputSchema = z.boolean();

      expect(() => getMimeTypesFromZodSchema(inputSchema, outputSchema))
        .to.throw(UnsupportedSchemaError)
        .with.property("message", "ZodBoolean not supported");
    });

    it("should include skill name in error message when provided", () => {
      const inputSchema = z.boolean();
      const outputSchema = z.string();
      const skillName = "testSkill";

      expect(() =>
        getMimeTypesFromZodSchema(inputSchema, outputSchema, skillName)
      )
        .to.throw(UnsupportedSchemaError)
        .with.property(
          "message",
          'Skill "testSkill": ZodBoolean not supported'
        );
    });
  });

  describe("UnsupportedSchemaError", () => {
    it("should be an instance of Error", () => {
      const error = new UnsupportedSchemaError("ZodBoolean");
      expect(error).to.be.instanceof(Error);
    });

    it("should have correct name property", () => {
      const error = new UnsupportedSchemaError("ZodBoolean");
      expect(error.name).to.equal("UnsupportedSchemaError");
    });

    it("should have correct code property", () => {
      const error = new UnsupportedSchemaError("ZodBoolean");
      expect(error.code).to.equal(-32004);
    });
  });
});
