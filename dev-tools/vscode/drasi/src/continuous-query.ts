import { Resource } from "./resource";


export interface ContinuousQuery extends Resource {
  apiVersion: string;
  name: string;
  spec: ContinuousQuerySpec;
}

interface ContinuousQuerySpec {

}