"""BIM Cost Item — auto-calculate budgeted_cost and variance before save."""
import frappe

def before_save(doc, method=None):
    qty  = float(doc.budgeted_qty or 0)
    rate = float(doc.unit_rate or 0)
    actual = float(doc.actual_cost or 0)
    doc.budgeted_cost = round(qty * rate, 2)
    doc.variance = round(actual - doc.budgeted_cost, 2)
