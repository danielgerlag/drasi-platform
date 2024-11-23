/* eslint-disable */
/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

/**
 * An event that represents a control signal from the query, such are start, stop, etc.
 */
export type ControlEvent = ResultEvent & {
  kind: "control";
  controlSignal: ControlSignal;
  [k: string]: unknown;
};

export interface ResultEvent {
  kind: "change" | "control";
  /**
   * The ID of the query that the event originated from
   */
  queryId: string;
  /**
   * The sequence number of the event
   */
  sequence: number;
  /**
   * The time at which the source change was recorded
   */
  sourceTimeMs: number;
  metadata?: RecordUnknown;
  [k: string]: unknown;
}
export interface RecordUnknown {
  [k: string]: unknown;
}
export interface ControlSignal {
  kind: "bootstrapStarted" | "bootstrapCompleted" | "running" | "stopped" | "deleted";
  [k: string]: unknown;
}