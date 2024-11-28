/*
 * Copyright 2024 The Drasi Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package io.drasi.source.sdk.models;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import java.util.Set;

public class SourceElement {

    private String id;
    private JsonNode properties;
    private Set<String> labels;
    private String startId;
    private String endId;


    public SourceElement(String id, JsonNode properties, Set<String> labels) {
        this.id = id;
        this.properties = properties;
        this.labels = labels;
    }

    public SourceElement(String id, JsonNode properties, Set<String> labels, String startId, String endId) {
        this.id = id;
        this.properties = properties;
        this.labels = labels;
        this.startId = startId;
        this.endId = endId;
    }

    public String toJson() {
        var result = ConvertProperties();
        return result.toString();
    }

    private JsonNode ConvertProperties() {
        var result = JsonNodeFactory.instance.objectNode();

        result.put("id", id);
        var lbls = JsonNodeFactory.instance.arrayNode();
        for (var lbl : labels)
            lbls.add(lbl);
        result.set("labels", lbls);

        if (properties != null) {
            var props = JsonNodeFactory.instance.objectNode();
            var pgFields = properties.fields();
            while (pgFields.hasNext()) {
                var field = pgFields.next();
                props.set(field.getKey(), field.getValue());
            }
            result.set("properties", properties);
        }

        if (startId != null) {
            result.put("start_id", startId);
        }

        if (endId != null) {
            result.put("end_id", endId);
        }

        return  result;
    }

    enum Op {
        INSERT,
        UPDATE,
        DELETE
    }
}