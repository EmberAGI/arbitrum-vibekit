import { AgentCard } from "@google-a2a/types/src/types.js";
import { CorsOptions } from "cors";
import { InMemoryTaskStore, TaskStore } from "./store.js";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { VibkitError } from "./error.js";

export interface AgentOptions {
  /** Task storage implementation. Defaults to InMemoryTaskStore. */
  taskStore?: TaskStore;
  /** CORS configuration options or boolean/string. Defaults to allowing all origins. */
  cors?: CorsOptions | boolean | string;
  /** Base path for the A2A endpoint. Defaults to '/'. */
  basePath?: string;
}

export class Agent {
  private taskHandler: TaskHandler;
  private taskStore: TaskStore;
  private corsOptions: CorsOptions | boolean | string;
  private basePath: string;
  // Track active cancellations
  private activeCancellations: Set<string> = new Set();
  card: AgentCard;

  private constructor(card: AgentCard, options: AgentOptions = {}) {
    this.taskStore = options.taskStore ?? new InMemoryTaskStore();
    this.corsOptions = options.cors ?? true;
    this.basePath = options.basePath ?? "/";
    // Ensure base path starts and ends with a slash if it's not just "/"
    if (this.basePath !== "/") {
      this.basePath = `/${this.basePath.replace(/^\/|\/$/g, "")}/`;
    }
    this.card = card;
  }

  static create(card: AgentCard, options: AgentOptions = {}) {
    return new Agent(card, options);
  }

  /**
   * Starts the Express server listening on the specified port.
   * @param port Port number to listen on. Defaults to 41241.
   * @returns The running Express application instance.
   */
  start(port = 41241): express.Express {
    const app = express();

    // Configure CORS
    if (this.corsOptions !== false) {
      const options =
        typeof this.corsOptions === "string"
          ? { origin: this.corsOptions }
          : this.corsOptions === true
          ? undefined // Use default cors options if true
          : this.corsOptions;
      app.use(cors(options));
    }

    // Middleware
    app.use(express.json()); // Parse JSON bodies

    app.get("/.well-known/agent.json", (req: Request, res: Response) => {
      res.json(this.card);
    });

    // Mount the endpoint handler
    app.post(this.basePath, this.endpoint());

    // Basic error handler
    app.use(this.errorHandler);

    // Start listening
    app.listen(port, () => {
      console.log(
        `A2A Server listening on port ${port} at path ${this.basePath}`
      );
    });

    return app;
  }

  async stop() {
    console.log("Stopping agent");
  }
}
