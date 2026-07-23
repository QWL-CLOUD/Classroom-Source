# Learners Medium-Width Responsive Layout Repair

## Baseline

- main: `71e020719cb8addd16dd6666514a7cba96b107a0`
- branch: `repair-learners-medium-width-responsive-layout`

## Closure

- > = 1400px keeps the approved full sidebar and wide Learners workspace.
- 881–1399px uses the existing compact 88px navigation rail.
- 1101–1399px retains the two-column Learners workspace with a 280–310px
  directory and a flexible detail workspace.
- 901–1100px switches Learners to the existing master-detail pattern before
  the two-column workspace becomes cramped.
- <= 880px retains the existing navigation drawer.
- The 1240px regression test verifies rail width, directory width, detail
  width, column separation, and no horizontal document overflow.

No data, domain, route, lifecycle, menu, or Library behavior changes.
