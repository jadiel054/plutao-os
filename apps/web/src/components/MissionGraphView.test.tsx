import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MissionGraphView } from "./MissionGraphView";

const graph = {
  version: 2 as const,
  nodes: [
    {
      id: "lesson",
      kind: "work" as const,
      title: "Preparar aula",
      description: null,
      definitionOfDone: null,
      specialistProfileId: "teaching_assistant",
      requiredCapabilities: [],
      dependsOn: [],
      retryPolicy: { maxAttempts: 1, timeoutSeconds: 120 },
    },
  ],
};

const profiles = [
  { id: "teaching_assistant", label: "Ensino e aprendizagem" },
  { id: "software_engineer", label: "Engenharia de software" },
];

describe("MissionGraphView specialist presentation", () => {
  it("shows the localized assigned profile instead of the opaque id", () => {
    const html = renderToStaticMarkup(
      <MissionGraphView graph={graph} specialistProfiles={profiles} />
    );
    expect(html).toContain("Especialista: Ensino e aprendizagem");
    expect(html).not.toContain("teaching_assistant");
  });

  it("offers profile assignment only when the caller marks the graph editable", () => {
    const readOnly = renderToStaticMarkup(
      <MissionGraphView graph={graph} specialistProfiles={profiles} />
    );
    const editable = renderToStaticMarkup(
      <MissionGraphView
        graph={graph}
        specialistProfiles={profiles}
        specialistsEditable
        onSpecialistChange={() => undefined}
      />
    );
    expect(readOnly).not.toContain("<select");
    expect(editable).toContain('aria-label="Especialista do nó Preparar aula"');
    expect(editable).toContain("Perfil padrão");
    expect(editable).toContain("Ensino e aprendizagem");
  });
});
