/**
 * SchoolIdentityFields - school name, logo, motto and emblem.
 * One component, used by BOTH the Assessment tab (Paper Details) and the Shading Sheet tab, so the two can never drift apart.
 * The state lives in the generator; this only draws the fields.
 */
import React, { useRef } from "react";
import { fileToPngDataUrl } from "../imageUtils.js";

export default function SchoolIdentityFields({ S, schoolName, setSchoolName, schoolLogo, setSchoolLogo, schoolMotto, setSchoolMotto, emblem, setEmblem }) {
  const logoRef = useRef(null);
  return (
    <>
      <div className="qa-field">
        <label style={S.lbl}>School name</label>
        <input value={schoolName} onChange={e => setSchoolName(e.target.value)} placeholder="e.g. St. Mary's JHS" style={S.inp} />
      </div>
      <div className="qa-field">
        <label style={S.lbl}>School logo <span className="qa-opt-lbl">(optional)</span></label>
        <input
          ref={logoRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={async e => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 4 * 1024 * 1024) { alert("Please use a logo image under 4MB."); return; }
            try { setSchoolLogo(await fileToPngDataUrl(file, 512)); }
            catch { alert("Sorry, that image couldn't be read. Please try a PNG or JPG."); }
            e.target.value = "";
          }}
        />
        <div className="qa-logo-row">
          {schoolLogo ? <img src={schoolLogo} alt="School logo" className="qa-logo-thumb" /> : <span className="qa-logo-empty" aria-hidden="true" />}
          <span className="qa-logo-hint">{schoolLogo ? "Printed on the paper." : "PNG or JPG, under 4 MB."}</span>
          {schoolLogo
            ? <button type="button" style={S.danger} onClick={() => setSchoolLogo(null)}>Remove</button>
            : <button type="button" style={S.sm} onClick={() => logoRef.current?.click()}>Upload</button>}
        </div>
      </div>
      <div className="eduq-grid-2" style={{ marginBottom: 14 }}>
        <div>
          <label style={S.lbl}>Motto or address line <span className="qa-opt-lbl">(optional)</span></label>
          <input value={schoolMotto} maxLength={90} onChange={e => setSchoolMotto(e.target.value)} placeholder="e.g. Knowledge, Discipline, Service" style={S.inp} />
        </div>
        <div>
          <label style={S.lbl}>Emblem if no logo</label>
          <select value={emblem} onChange={e => setEmblem(e.target.value)} style={S.sel} disabled={!!schoolLogo} title={schoolLogo ? "Your uploaded logo is used" : ""}>
            <option value="auto">Generated school crest</option>
            <option value="none">No emblem</option>
          </select>
        </div>
      </div>
    </>
  );
}
