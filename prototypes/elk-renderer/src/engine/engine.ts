import type {
  ApplyResult,
  Component,
  Connection,
  Model,
  Patch,
  Ref,
  ValidationError,
} from "./types"

export function validate(model: Model): { ok: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = []
  const componentIds = new Set<string>()
  for (const component of model.components) {
    if (componentIds.has(component.id)) {
      errors.push({
        code: "DUP_ID",
        path: `/components/${component.id}`,
        message: `Duplicate component id: ${component.id}`,
        nodeId: component.id,
      })
    }
    componentIds.add(component.id)
  }
  const connectionIds = new Set<string>()
  for (const connection of model.connections) {
    if (connectionIds.has(connection.id)) {
      errors.push({
        code: "DUP_ID",
        path: `/connections/${connection.id}`,
        message: `Duplicate connection id: ${connection.id}`,
      })
    }
    connectionIds.add(connection.id)
    if (!componentIds.has(connection.fromId)) {
      errors.push({
        code: "REF",
        path: `/connections/${connection.id}/fromId`,
        message: `Unknown fromId: ${connection.fromId}`,
      })
    }
    if (!componentIds.has(connection.toId)) {
      errors.push({
        code: "REF",
        path: `/connections/${connection.id}/toId`,
        message: `Unknown toId: ${connection.toId}`,
      })
    }
  }
  return { ok: errors.length === 0, errors }
}

export function applyPatch(model: Model, patch: Patch): ApplyResult {
  const next = structuredClone(model)
  const diff = { added: [] as Ref[], removed: [] as Ref[], changed: [] as Ref[] }

  switch (patch.kind) {
    case "add_component": {
      if (next.components.some(c => c.id === patch.component.id)) {
        return {
          ok: false,
          errors: [
            {
              code: "DUP_ID",
              path: `/components/${patch.component.id}`,
              message: `Component ${patch.component.id} already exists`,
            },
          ],
        }
      }
      next.components.push(patch.component)
      diff.added.push({ entity: "component", id: patch.component.id })
      break
    }
    case "remove_component": {
      const idx = next.components.findIndex(c => c.id === patch.componentId)
      if (idx === -1) {
        return {
          ok: false,
          errors: [
            {
              code: "REF",
              path: `/components/${patch.componentId}`,
              message: `Component ${patch.componentId} not found`,
            },
          ],
        }
      }
      const incident = next.connections.filter(
        c => c.fromId === patch.componentId || c.toId === patch.componentId,
      )
      if (incident.length > 0 && !patch.cascade) {
        return {
          ok: false,
          errors: [
            {
              code: "REF",
              path: `/components/${patch.componentId}`,
              message: `Component has ${incident.length} connections; pass cascade: true to remove them`,
            },
          ],
        }
      }
      next.components.splice(idx, 1)
      diff.removed.push({ entity: "component", id: patch.componentId })
      for (const connection of incident) {
        const cIdx = next.connections.findIndex(c => c.id === connection.id)
        if (cIdx >= 0) next.connections.splice(cIdx, 1)
        diff.removed.push({ entity: "connection", id: connection.id })
      }
      break
    }
    case "add_connection": {
      if (next.connections.some(c => c.id === patch.connection.id)) {
        return {
          ok: false,
          errors: [
            {
              code: "DUP_ID",
              path: `/connections/${patch.connection.id}`,
              message: `Connection ${patch.connection.id} already exists`,
            },
          ],
        }
      }
      next.connections.push(patch.connection)
      diff.added.push({ entity: "connection", id: patch.connection.id })
      break
    }
    case "remove_connection": {
      const idx = next.connections.findIndex(c => c.id === patch.connectionId)
      if (idx === -1) {
        return {
          ok: false,
          errors: [
            {
              code: "REF",
              path: `/connections/${patch.connectionId}`,
              message: `Connection ${patch.connectionId} not found`,
            },
          ],
        }
      }
      next.connections.splice(idx, 1)
      diff.removed.push({ entity: "connection", id: patch.connectionId })
      break
    }
    case "set_property":
    case "rename": {
      const entity =
        patch.target.entity === "component"
          ? next.components.find(c => c.id === patch.target.id)
          : next.connections.find(c => c.id === patch.target.id)
      if (!entity) {
        return {
          ok: false,
          errors: [
            {
              code: "REF",
              path: `/${patch.target.entity}s/${patch.target.id}`,
              message: `${patch.target.entity} ${patch.target.id} not found`,
            },
          ],
        }
      }
      if (patch.kind === "rename") {
        ;(entity as Component | Connection & { name: string }).name = patch.newName
      } else {
        ;(entity as unknown as Record<string, unknown>)[patch.key] = patch.value
      }
      diff.changed.push(patch.target)
      break
    }
  }

  const validation = validate(next)
  if (!validation.ok) return { ok: false, errors: validation.errors }
  return { ok: true, model: next, diff }
}

export function getOutgoingConnections(model: Model, id: string): Connection[] {
  return model.connections.filter(c => c.fromId === id)
}

export function getIncomingConnections(model: Model, id: string): Connection[] {
  return model.connections.filter(c => c.toId === id)
}

export function getComponent(model: Model, id: string): Component | undefined {
  return model.components.find(c => c.id === id)
}
