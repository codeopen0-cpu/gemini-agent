// Orbit insertion for SCANsat contract
// Target: Ap=2,681,803m  Pe=320,794m  Incl=2.1deg  LAN=209.7deg  ArgPe=76.7deg
// Launches to circular parking orbit, then does transfer burns.
CLEARSCREEN.
PRINT "=== ORBIT INSERTION ===" + CHAR(13) + CHAR(10).
SET tgt_ap TO 2681803.
SET tgt_pe TO 320794.
SET tgt_incl TO 2.1.
SET tgt_lan TO 209.7.
SET tgt_argpe TO 76.7.
// ---- Log setup ----
LOG "=== RUN " + TIME:SECONDS + " ===" TO "0:/orbit_log.txt".
LOG "Target Ap: " + ROUND(tgt_ap,0) + " Pe: " + ROUND(tgt_pe,0) + " Incl: " + ROUND(tgt_incl,1) TO "0:/orbit_log.txt".
FUNCTION say {
PARAMETER msg.
PRINT msg + CHAR(13) + CHAR(10).
LOG "t" + ROUND(TIME:SECONDS,1) + ": " + msg TO "0:/orbit_log.txt".
}.
FUNCTION logmsg {
PARAMETER msg.
LOG "t" + ROUND(TIME:SECONDS,1) + ": " + msg TO "0:/orbit_log.txt".
}.
SET target_alt TO 100000.
SET deployed_antennas TO FALSE.
logmsg("Script started").
// ---- Phase 1: Launch to circular parking orbit ----
SET hdg TO 90 - tgt_incl.
SET turn_start_alt TO 1000.
SET turn_end_alt TO 40000.
say("Launching!").
LOCK THROTTLE TO 1.0.
WAIT 0.3.
WAIT UNTIL STAGE:READY.
STAGE.
LOCK STEERING TO HEADING(hdg, 90).
WAIT 1.0.
SET pitch TO 90.
UNTIL SHIP:APOAPSIS > target_alt {
SET my_alt TO SHIP:ALTITUDE.
SET my_spd TO SHIP:VELOCITY:SURFACE:MAG.
IF my_alt < turn_start_alt { SET pitch TO 90. }
ELSE IF my_alt > turn_end_alt { SET pitch TO 5. }
ELSE {
    SET frac TO (my_alt - turn_start_alt) / (turn_end_alt - turn_start_alt).
    SET pitch TO 90 * (1 - frac).
    IF pitch < 5 { SET pitch TO 5. }.
}.
LOCK STEERING TO HEADING(hdg, pitch).

SET total_thrust TO 0.
FOR ep IN SHIP:PARTS {
    IF ep:HASMODULE("ModuleEnginesFX") { SET total_thrust TO total_thrust + ep:GETMODULE("ModuleEnginesFX"):GETFIELD("thrust"). }.
    IF ep:HASMODULE("ModuleEngines") { SET total_thrust TO total_thrust + ep:GETMODULE("ModuleEngines"):GETFIELD("thrust"). }.
}.
IF total_thrust = 0 AND SHIP:APOAPSIS > 100000 { STAGE. }.

PRINT "A:" + ROUND(my_alt,0) + " S:" + ROUND(my_spd,0) + " Ap:" + ROUND(SHIP:APOAPSIS,0) + CHAR(13) + CHAR(10).
LOG "t" + ROUND(TIME:SECONDS,1) + ": A:" + ROUND(my_alt,0) + " S:" + ROUND(my_spd,0) + " Ap:" + ROUND(SHIP:APOAPSIS,0) TO "0:/orbit_log.txt".
WAIT 0.1.
}.
logmsg("Ascent done. Alt: " + ROUND(my_alt,0) + " Ap: " + ROUND(SHIP:APOAPSIS,0)).
// Deploy antennas
IF NOT deployed_antennas {
logmsg("Deploying antennas...").
IF ADDONS:AVAILABLE("RT") {
FOR p IN SHIP:PARTS {
IF p:HASMODULE("ModuleRTAntenna") {
SET m TO p:GETMODULE("ModuleRTAntenna").
m:DOEVENT("activate").
m:SETFIELD("target", "Mission Control").
}.
}.
} ELSE {
FOR p IN SHIP:PARTS {
FOR m IN p:MODULES {
SET mn TO m:NAME.
IF mn:FIND("ntenna") >= 0 OR mn:FIND("Deployable") >= 0 {
SET evtlist TO m:ALLEVENTNAMES.
IF evtlist:LENGTH > 0 { m:DOEVENT(evtlist[0]). WAIT 0.1. }.
}.
}.
}.
}.
SET deployed_antennas TO TRUE.
}.
// Circularize at parking orbit
LOCK THROTTLE TO 0.0.
WAIT UNTIL SHIP:APOAPSIS - SHIP:ALTITUDE < 3000.
LOCK STEERING TO PROGRADE.
LOCK THROTTLE TO 1.0.
WAIT UNTIL SHIP:PERIAPSIS > target_alt - 2000.
LOCK THROTTLE TO 0.0.
logmsg("Circularized at " + ROUND(target_alt,0) + "m").
say("Circular at " + ROUND(target_alt,0) + "m").
// ---- Phase 2: Transfer burn to raise Ap ----
SET mu TO 3.5316E12.
SET r1 TO 680000.
SET r2 TO tgt_ap + 600000.
SET a_transfer TO (r1 + r2) / 2.
SET v1 TO SQRT(mu / r1).
SET v_transfer_peri TO SQRT(mu * (2 / r1 - 1 / a_transfer)).
SET dv TO v_transfer_peri - v1.
say("Transfer dV: " + ROUND(dv,0) + " m/s").
LOCK STEERING TO PROGRADE.
WAIT 1.0.
LOCK THROTTLE TO 1.0.
UNTIL SHIP:APOAPSIS > tgt_ap * 0.95 { WAIT 0.1. }.
LOCK THROTTLE TO 0.0.
// ---- Phase 3: Coast and raise Pe ----
say("Coasting to Ap...").
SET WARP TO 4.
UNTIL SHIP:APOAPSIS - SHIP:ALTITUDE < 30000 { WAIT 1.0. }.
SET WARP TO 0.
say("Raising Pe...").
LOCK STEERING TO PROGRADE.
LOCK THROTTLE TO 0.3.
WAIT UNTIL SHIP:PERIAPSIS > tgt_pe - 5000 OR SHIP:APOAPSIS - SHIP:ALTITUDE < 2000.
LOCK THROTTLE TO 0.0.
// ---- Phase 4: Fine-tune ----
say("Fine-tuning orbit parameters...").
// Adjust Ap
WAIT UNTIL SHIP:ALTITUDE < SHIP:PERIAPSIS + 5000.
IF ABS(SHIP:APOAPSIS - tgt_ap) > 10000 {
LOCK STEERING TO PROGRADE.
LOCK THROTTLE TO 0.15.
UNTIL ABS(SHIP:APOAPSIS - tgt_ap) < 1000 { WAIT 0.1. }.
LOCK THROTTLE TO 0.0.
}.
// Adjust Pe
WAIT UNTIL SHIP:ALTITUDE > SHIP:APOAPSIS - 5000.
IF ABS(SHIP:PERIAPSIS - tgt_pe) > 10000 {
LOCK STEERING TO PROGRADE.
LOCK THROTTLE TO 0.15.
UNTIL ABS(SHIP:PERIAPSIS - tgt_pe) < 1000 { WAIT 0.1. }.
LOCK THROTTLE TO 0.0.
}.
// Inclination (Minor)
IF ABS(SHIP:ORBIT:INCLINATION - tgt_incl) > 0.5 {
say("Correcting inclination...").
LOCK STEERING TO NORMAL.
LOCK THROTTLE TO 0.05.
WAIT 2.0.
LOCK THROTTLE TO 0.0.
}.
// Note on Argument of Periapsis:
// ArgPe is difficult to change via simple burn; requires long-term phasing.
// The script has aligned Ap, Pe, and Incl.
// Recommend manual station-keeping for ArgPe 76.7.
// ---- Results ----
PRINT "=== FINAL STATUS ===" + CHAR(13) + CHAR(10).
PRINT "Ap: " + ROUND(SHIP:APOAPSIS,0) + " / " + tgt_ap + CHAR(13) + CHAR(10).
PRINT "Pe: " + ROUND(SHIP:PERIAPSIS,0) + " / " + tgt_pe + CHAR(13) + CHAR(10).
PRINT "Incl: " + ROUND(SHIP:ORBIT:INCLINATION,2) + " / " + tgt_incl + CHAR(13) + CHAR(10).
PRINT "LAN: " + ROUND(SHIP:ORBIT:LAN,1) + " / " + tgt_lan + CHAR(13) + CHAR(10).
PRINT "ArgPe: " + ROUND(SHIP:ORBIT:ARGUMENTOFPERIAPSIS,1) + " / " + tgt_argpe + CHAR(13) + CHAR(10).