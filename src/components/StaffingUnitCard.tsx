import { PositionStaffingRow } from "@/components/PositionStaffingRow";
import { StaffingCardGroup } from "@/components/StaffingCardGroup";
import type { StaffingUnitNode } from "@/lib/staffingUnitTree";

interface Assignment {
  id: string;
  employeeId: string;
  label: string;
}

interface EmployeeOption {
  id: string;
  label: string;
}

/**
 * One organizational unit's card, recursively containing its own qualifying
 * child units — "كرت داخل كرت داخل كرت" (2026-09-01), stopping wherever
 * `buildStaffingGroups` already pruned an empty branch. A plain server
 * component: no hooks of its own, so it composes fine with the client
 * `PositionStaffingRow`/`StaffingCardGroup` it renders.
 *
 * 2026-09-03: a node's own children are always exactly one real org_units
 * sibling group (`buildNode` builds them from `childrenOf.get(node.id)`),
 * so they're always draggable against each other when there's more than
 * one -- unlike the mixed top-level list in staffing/page.tsx, which can
 * hold several distinct real sibling groups at once (see StaffingCardGroup).
 */
export function StaffingUnitCard({
  node,
  depth,
  assignmentsByPositionId,
  employees,
  canEdit,
}: {
  node: StaffingUnitNode;
  depth: number;
  assignmentsByPositionId: Map<string, Assignment[]>;
  employees: EmployeeOption[];
  canEdit: boolean;
}) {
  return (
    <div className={depth === 0 ? "sru-card sru-staffing-unit-card" : "sru-staffing-unit-card-nested"}>
      <h3 className={depth === 0 ? "sru-staffing-unit-card-title" : "sru-staffing-unit-card-title sru-staffing-unit-card-title-nested"}>
        {node.name}
      </h3>

      {node.positions.length > 0 ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {node.positions.map((position) => (
            <PositionStaffingRow
              key={position.id}
              positionId={position.id}
              nameAr={position.nameAr}
              nameEn={position.nameEn}
              assignments={assignmentsByPositionId.get(position.id) ?? []}
              employees={employees}
            />
          ))}
        </ul>
      ) : null}

      {node.children.length > 0 ? (
        <div className="sru-staffing-unit-card-children">
          {canEdit ? (
            <StaffingCardGroup
              items={node.children.map((child) => ({
                id: child.id,
                // A lone child has no sibling to drag against here.
                groupId: node.children.length > 1 ? node.id : null,
                node: (
                  <StaffingUnitCard
                    node={child}
                    depth={depth + 1}
                    assignmentsByPositionId={assignmentsByPositionId}
                    employees={employees}
                    canEdit={canEdit}
                  />
                ),
              }))}
            />
          ) : (
            node.children.map((child) => (
              <StaffingUnitCard
                key={child.id}
                node={child}
                depth={depth + 1}
                assignmentsByPositionId={assignmentsByPositionId}
                employees={employees}
                canEdit={canEdit}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
