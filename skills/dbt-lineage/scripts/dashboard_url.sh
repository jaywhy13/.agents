#!/usr/bin/env bash
# Build a pre-filtered Direct Dependency Daily Summary dashboard URL for a model.
#
# Usage:
#   dashboard_url.sh downstream <bare_table>   # who consumes this model (model = ancestor)
#   dashboard_url.sh upstream   <bare_table>   # what feeds this model   (model = descendant)
#
# <bare_table> is the unqualified table name, e.g. base__sensitive_orders.
set -euo pipefail

direction="${1:-}"
table="${2:-}"
if [[ -z "$direction" || -z "$table" ]]; then
  echo "usage: dashboard_url.sh <downstream|upstream> <bare_table>" >&2
  exit 1
fi

base="https://observe.shopify.io/d/aelw2qn5qptkwd/direct-dependency-daily-summary"

# All criticality buckets + all violation types selected (matches the dashboard's "show everything" state).
crit="var-ancestorCriticality=1&var-ancestorCriticality=2&var-ancestorCriticality=3&var-ancestorCriticality=4&var-ancestorCriticality=5&var-ancestorCriticality=NULL"
crit+="&var-descendantCriticality=1&var-descendantCriticality=2&var-descendantCriticality=3&var-descendantCriticality=4&var-descendantCriticality=5&var-descendantCriticality=NULL"
viol="var-violations=public&var-violations=deprecation&var-violations=none&var-violations=ownership&var-violations=timeliness&var-violations=criticality&var-violations=mart"
allvars="var-ancestorOwner=\$__all&var-ancestorProject=\$__all&var-ancestorLayer=\$__all&var-descendantOwner=\$__all&var-descendantProject=\$__all&var-descendantLayer=\$__all"

case "$direction" in
  downstream) tablevars="var-ancestorTable=${table}&var-descendantTable=" ;;
  upstream)   tablevars="var-ancestorTable=&var-descendantTable=${table}" ;;
  *) echo "direction must be 'downstream' or 'upstream'" >&2; exit 1 ;;
esac

echo "${base}?orgId=1&from=now-30d&to=now&timezone=browser&${allvars}&${tablevars}&${crit}&${viol}"
