# Server Script: BIM Cost Item - Calculate on Save
# Type: DocType Event
# Event: Before Save

# ES BIM Phase 3 — Auto-calculate budgeted_cost and variance before save
# Sandbox: no import, no augmented assignment, string concat only

bq = doc.budgeted_qty or 0
ur = doc.unit_rate or 0
ac = doc.actual_cost or 0

bq_float = float(bq)
ur_float = float(ur)
ac_float = float(ac)

budgeted = bq_float * ur_float
variance = ac_float - budgeted

doc.budgeted_cost = budgeted
doc.variance = variance