// Lernplan "Weg zum Top-Trader": Module, Lektionen, Aufgaben und Kontrollfragen.
// Inhalte sind eigene Texte (HTML aus dieser Datei, keine Nutzerdaten).
// Jede Lektion ist auf etwa 25 Minuten ausgelegt: lesen, Aufgabe machen, Fragen beantworten.

export const MODULES = [
  {
    key: 'risiko', title: 'Risiko & Mathematik', phase: 'Phase 1',
    intro: 'Bevor es um Setups geht: Wer die Mathematik von Risiko und Verlustserien versteht, überlebt lange genug, damit sein Edge wirken kann.',
    lessons: [
      {
        id: 'r-multiple', title: 'R-Multiples und Erwartungswert',
        goal: 'Du misst jeden Trade in R und weißt, ob deine Strategie Geld verdient.',
        body: `
          <p><b>1 R</b> ist der Betrag, den du riskierst, wenn der Stop getroffen wird. Ein Trade, der das Doppelte deines Risikos bringt, ist <b>+2 R</b>; ein voller Stop ist <b>−1 R</b>. R macht Trades vergleichbar, egal wie groß das Konto oder die Position ist.</p>
          <p>Der <b>Erwartungswert</b> ist der durchschnittliche Gewinn pro Trade in R:</p>
          <p class="lp-formula">Erwartungswert = Trefferquote × Ø Gewinn (R) − Verlustquote × Ø Verlust (R)</p>
          <ul>
            <li>40 % Treffer mit 2 R, 60 % Verluste mit 1 R → 0,4 × 2 − 0,6 × 1 = <b>+0,2 R</b> pro Trade.</li>
            <li>50 % Treffer mit 1,5 R → 0,5 × 1,5 − 0,5 × 1 = <b>+0,25 R</b>.</li>
            <li>35 % Treffer mit 2 R → <b>+0,05 R</b>: kaum noch ein Edge, nach Kosten eher keiner.</li>
          </ul>
          <p>Bei 0,8 % Risiko und +0,3 R Erwartungswert verdienst du im Schnitt 0,24 % pro Trade. Bei 8 Trades im Monat sind das rund 2 % – realistisch, nachhaltig und für Propfirms völlig ausreichend.</p>`,
        rule: 'Nicht die Trefferquote zählt, sondern der Erwartungswert über viele Trades.',
        task: 'Öffne den Mentoring-Tab und notiere deinen Erwartungswert der letzten 200 Trades. Rechne ihn mit Trefferquote und Ø Gewinn/Verlust aus der Übersicht nach.',
        links: [['mentoring.html', 'Mentoring'], ['dashboard.html', 'Übersicht']],
        quiz: [
          { q: 'Du gewinnst 45 % deiner Trades mit Ø 1,8 R und verlierst 55 % mit Ø 1 R. Wie hoch ist der Erwartungswert?', a: ['+0,26 R', '−0,10 R', '+0,81 R'], ok: 0, why: '0,45 × 1,8 − 0,55 × 1 = 0,81 − 0,55 = +0,26 R.' },
          { q: 'Was bedeutet ein Trade mit −0,5 R?', a: ['Du hast die Hälfte deines geplanten Risikos verloren', 'Du hast 0,5 % des Kontos verloren', 'Der Stop wurde doppelt getroffen'], ok: 0, why: 'R ist relativ zum geplanten Risiko: −0,5 R heißt, du bist vor dem Stop mit halbem Verlust raus.' },
        ],
      },
      {
        id: 'positionsgroesse', title: 'Positionsgröße und Risiko pro Trade',
        goal: 'Jeder Trade riskiert exakt denselben Prozentsatz – unabhängig vom Stop-Abstand.',
        body: `
          <p>Die Lotgröße folgt aus dem Risiko, nie umgekehrt: <b>Lots = Risikobetrag ÷ (Stop-Abstand in Pips × Pipwert pro Lot)</b>. Ein weiter Stop bedeutet kleinere Position, ein enger Stop größere Position – das Risiko bleibt gleich.</p>
          <p>Dein ATR-basierter Stop sorgt dafür, dass der Stop zur aktuellen Volatilität passt. Der Lot-Rechner sorgt dafür, dass der Betrag stimmt.</p>
          <ul>
            <li><b>Konstantes Risiko</b> (0,8 %) macht deine Statistik aussagekräftig. Wechselnde Risiken verzerren Gewinn und Verlust.</li>
            <li><b>Kein Risiko erhöhen nach Verlusten</b> („zurückholen“) und keines nach Gewinnen („läuft gerade“).</li>
            <li>Korrelierte Trades (z. B. EURUSD long und GBPUSD long) sind fast ein doppelter Trade. Deine Regel „max. 1 Position pro Währung“ schützt davor.</li>
          </ul>`,
        rule: 'Das Risiko bestimmst du vor dem Trade – die Lotgröße ist nur noch Rechnung.',
        task: 'Berechne für deine nächsten 3 Setups die Lotgröße im Lot-Rechner und trage das Risiko im Journal ein. Prüfe danach im Level-Tab „Risiko eingehalten“.',
        links: [['rechner.html', 'Lot-Rechner'], ['level.html', 'Level']],
        quiz: [
          { q: 'Dein Stop muss wegen hoher Volatilität doppelt so weit sein wie sonst. Was tust du?', a: ['Lotgröße halbieren', 'Lotgröße gleich lassen', 'Trade auslassen, weil der Stop zu weit ist'], ok: 0, why: 'Doppelter Abstand bei halber Größe ergibt dasselbe Risiko. Auslassen ist nur nötig, wenn das Setup nicht mehr ins Playbook passt.' },
          { q: 'Warum ist konstantes Risiko pro Trade wichtig für deine Auswertung?', a: ['Weil sonst einzelne große Trades die Statistik dominieren', 'Weil Propfirms es verlangen', 'Weil der Spread dann kleiner ist'], ok: 0, why: 'Mit gleichem Risiko zählt jeder Trade gleich. So zeigt die Statistik den Edge und nicht die Zufälle der Positionsgröße.' },
        ],
      },
      {
        id: 'drawdown', title: 'Verlustserien und Drawdown-Mathematik',
        goal: 'Du erwartest Verlustserien, statt von ihnen überrascht zu werden.',
        body: `
          <p>Auch ein guter Edge produziert lange Verlustserien. Wahrscheinlichkeit, in 100 Trades <b>mindestens einmal</b> so viele Verluste in Folge zu haben:</p>
          <table class="lp-table"><thead><tr><th>Trefferquote</th><th>5 in Folge</th><th>6 in Folge</th><th>8 in Folge</th><th>10 in Folge</th></tr></thead>
          <tbody><tr><td>40 %</td><td>98 %</td><td>87 %</td><td>49 %</td><td>20 %</td></tr>
          <tr><td>45 %</td><td>92 %</td><td>73 %</td><td>31 %</td><td>10 %</td></tr>
          <tr><td>50 %</td><td>81 %</td><td>55 %</td><td>17 %</td><td>4 %</td></tr></tbody></table>
          <p>Bei 40 % Trefferquote ist eine Serie von 6 Verlusten also fast sicher. Mit 0,8 % Risiko kosten 10 Verluste in Folge rund 7,7 % – unangenehm, aber überlebbar. Mit 2 % Risiko wären es fast 18 %.</p>
          <p>Verluste wiegen schwerer als Gewinne: Nach −10 % brauchst du +11 %, nach −20 % schon +25 %, nach −50 % sogar +100 %.</p>`,
        rule: 'Eine Verlustserie ist kein Beweis, dass dein System kaputt ist – erst die Statistik über viele Trades entscheidet.',
        task: 'Suche im Journal deine längste Verlustserie. Schreibe auf, was du währenddessen anders gemacht hast als sonst (Risiko, Setups, Häufigkeit).',
        links: [['index.html', 'Journal']],
        quiz: [
          { q: 'Du hast 45 % Trefferquote und 6 Verluste in Folge. Was sagt das über dein System?', a: ['Wenig – das passiert in 100 Trades mit ~73 % Wahrscheinlichkeit', 'Das System funktioniert nicht mehr', 'Du solltest das Risiko erhöhen, um aufzuholen'], ok: 0, why: 'Solche Serien sind normal. Erst eine Auswertung über viele Trades zeigt, ob der Edge noch da ist.' },
          { q: 'Ein Konto ist 20 % im Minus. Wie viel Gewinn brauchst du, um wieder auf null zu kommen?', a: ['20 %', '25 %', '40 %'], ok: 1, why: 'Von 80 zurück auf 100 sind 20 ÷ 80 = 25 %.' },
        ],
      },
      {
        id: 'prop-regeln', title: 'Prop-Firm-Regeln als Risikorahmen',
        goal: 'Du kennst den Puffer zu Tagesverlust- und Drawdown-Limit und tradest nie in dessen Nähe.',
        body: `
          <p>Propfirms beenden Konten nicht wegen schlechter Trades, sondern wegen Regelverstößen: <b>Tagesverlust-Limit</b> und <b>Max-Drawdown</b> (statisch ab Startkapital oder trailing vom Höchststand).</p>
          <ul>
            <li>Rechne dein Limit in Trades um: Bei 5 % Tageslimit und 0,8 % Risiko wären das ~6 volle Verluste – mit 3 offenen Trades plus Slippage bist du schneller dran, als es scheint.</li>
            <li>Setze dir ein <b>eigenes, engeres Limit</b>: z. B. Stopp bei −2 % am Tag (deine Tilt-Regel: 2 Verluste).</li>
            <li>Nahe am Max-Drawdown: Risiko halbieren statt „Augen zu und durch“.</li>
            <li>Lies die Regeln zu News-Trading, Wochenende und Mindest-Handelstagen – sie unterscheiden sich je Firma und Programm.</li>
          </ul>`,
        rule: 'Dein eigenes Limit greift immer vor dem Limit der Propfirm.',
        task: 'Trage für jedes Konto Tageslimit und Max-Drawdown in der Kontoverwaltung ein. Notiere, wie viele volle Verluste (R) bis zu jedem Limit fehlen.',
        links: [['dashboard.html', 'Übersicht & Limits']],
        quiz: [
          { q: 'Dein Konto ist 1 % vom Max-Drawdown entfernt. Was ist die beste Reaktion?', a: ['Risiko pro Trade deutlich senken', 'Einen großen Trade machen, um Abstand zu gewinnen', 'Normal weitertraden'], ok: 0, why: 'Mit kleinerem Risiko überlebt das Konto mehrere Verluste und kann sich erholen.' },
          { q: 'Was ist der Unterschied zwischen statischem und trailing Drawdown?', a: ['Statisch zählt ab Startkapital, trailing ab dem Höchststand', 'Trailing gilt nur für Krypto', 'Es gibt keinen Unterschied'], ok: 0, why: 'Beim trailing Drawdown wandert die Grenze mit deinem Kontohöchststand nach oben.' },
        ],
      },
    ],
  },
  {
    key: 'edge', title: 'Edge & Playbook', phase: 'Phase 1–2',
    intro: 'Ein Edge ist ein wiederholbares Muster mit positivem Erwartungswert. Ein Playbook macht ihn so konkret, dass du ihn jedes Mal gleich ausführst.',
    lessons: [
      {
        id: 'stichprobe', title: 'Was ist ein Edge – und warum 100 Trades?',
        goal: 'Du bewertest dein System nach Stichproben, nicht nach den letzten fünf Trades.',
        body: `
          <p>Einzelne Trades sind fast reiner Zufall. Erst viele gleich ausgeführte Trades zeigen, ob ein Muster einen Vorteil hat. Bei 20 Trades kann ein System mit +0,3 R Erwartungswert leicht im Minus stehen; bei 100 Trades wird das unwahrscheinlicher.</p>
          <ul>
            <li><b>Gleiche Ausführung</b> ist die Voraussetzung: Wer die Regeln ständig ändert, misst nur Rauschen.</li>
            <li>Ein Edge ist <b>spezifisch</b>: Setup, Zeitrahmen, Paare, Sessions. „Trendfolge“ ist kein Edge, „4H-BITR mit 15M-Bestätigung in Trendrichtung“ schon eher.</li>
            <li>Kosten (Spread, Kommission, Swap) fressen Edge. Ein System mit +0,05 R ist praktisch keins.</li>
          </ul>`,
        rule: 'Erst 100 gleiche Trades, dann ein Urteil.',
        task: 'Starte im Mentoring-Tab deinen 100-Trade-Block. Schreibe in einem Satz auf, welches Muster genau du in diesem Block testest.',
        links: [['mentoring.html', 'Block starten']],
        quiz: [
          { q: 'Nach 12 Trades mit neuen Regeln liegst du bei −3 R. Was folgt daraus?', a: ['Noch kaum etwas – die Stichprobe ist zu klein', 'Die Regeln sind schlecht und müssen geändert werden', 'Das Risiko sollte verdoppelt werden'], ok: 0, why: '12 Trades sagen statistisch wenig. Erst ein größerer Block mit gleicher Ausführung erlaubt ein Urteil.' },
          { q: 'Warum zerstören häufige Regeländerungen die Auswertung?', a: ['Weil jede Version zu wenige Trades hat, um sie zu bewerten', 'Weil das Journal sonst zu lang wird', 'Weil Propfirms das verbieten'], ok: 0, why: 'Jede Änderung startet die Stichprobe neu. Am Ende weißt du über keine Version etwas.' },
        ],
      },
      {
        id: 'playbook', title: 'Ein Playbook schreiben',
        goal: 'Für jedes Setup gibt es eine Seite, die so klar ist, dass ein anderer Trader es nachhandeln könnte.',
        body: `
          <p>Ein Playbook-Eintrag hat immer dieselben Teile:</p>
          <ol>
            <li><b>Kontext:</b> Was muss auf 4H gegeben sein (Trend, Struktur, Level)?</li>
            <li><b>Auslöser:</b> Was genau passiert auf 15M, damit du einsteigst?</li>
            <li><b>Stop:</b> Wo und warum (ATR, Struktur)?</li>
            <li><b>Ziel:</b> Welches R und an welchem Level (z. B. Trend 2 R+, Pullback 1,5 R)?</li>
            <li><b>Ausschlüsse:</b> Wann handelst du es nicht (News, gegen Bias, schon eine Position in der Währung)?</li>
            <li><b>Beispiele:</b> 3 Lehrbuch-Screenshots und 1 Beispiel, wie es nicht aussehen darf.</li>
          </ol>
          <p>Bewerte jedes Setup vor dem Einstieg mit <b>A+, A oder B</b>. Im Konsistenz-Block handelst du nur A+ und A.</p>`,
        rule: 'Was nicht im Playbook steht, wird nicht gehandelt.',
        task: 'Schreibe die Playbook-Seite für dein bestes Setup (unperfekt ist erlaubt). Lade die Screenshots als Trade-Ideen hoch.',
        links: [['cockpit.html#idee', 'Trade-Idee']],
        quiz: [
          { q: 'Welcher Teil fehlt in vielen Playbooks und kostet am meisten Geld?', a: ['Die Ausschlüsse: wann man nicht handelt', 'Die Farbe der Kerzen', 'Der Name des Setups'], ok: 0, why: 'Die meisten Verluste entstehen durch Trades, die fast passen. Klare Ausschlüsse filtern sie raus.' },
          { q: 'Ein Setup erfüllt 4 von 5 Bedingungen. Was tust du im Konsistenz-Block?', a: ['Nicht handeln oder als B-Setup auslassen', 'Mit halbem Risiko handeln', 'Normal handeln, ist ja fast perfekt'], ok: 0, why: 'Im Block testest du genau dein Playbook. Halbe Setups verwässern die Statistik.' },
        ],
      },
      {
        id: 'mtf', title: 'Marktstruktur und Multi-Timeframe',
        goal: 'Du liest den höheren Zeitrahmen zuerst und nutzt den kleinen nur für das Timing.',
        body: `
          <p><b>Top-down</b>: Der höhere Zeitrahmen (4H, mit Blick auf Daily) gibt Richtung und Zonen vor, der kleinere (15M) nur den Einstiegszeitpunkt.</p>
          <ul>
            <li><b>Aufwärtstrend:</b> höhere Hochs und höhere Tiefs. Ein Bruch des letzten höheren Tiefs ist das erste Warnsignal.</li>
            <li><b>Liquidität</b> liegt über alten Hochs und unter alten Tiefs (Stops anderer Trader). Kurse holen sie oft, bevor sie drehen.</li>
            <li>Der beste Einstieg liegt dort, wo der kleine Zeitrahmen <b>in Richtung des großen</b> dreht – nicht dagegen.</li>
            <li>Konflikt zwischen den Zeitrahmen? Dann ist es kein A-Setup.</li>
          </ul>`,
        rule: 'Der große Zeitrahmen entscheidet die Richtung, der kleine nur den Moment.',
        task: 'Markiere für deine 10–12 Kernpaare auf 4H die aktuelle Struktur (Trend, letztes höheres Tief / tieferes Hoch) und notiere sie im Planungsmodul.',
        links: [['cockpit.html', 'Cockpit']],
        quiz: [
          { q: '4H ist klar aufwärts, 15M zeigt einen kurzen Abwärtsimpuls. Was ist das für einen Trendfolger?', a: ['Eine mögliche Pullback-Chance für Long', 'Ein Short-Signal', 'Ein Grund, das Paar zu meiden'], ok: 0, why: 'Ein Rücksetzer im kleinen Zeitrahmen gegen den großen Trend ist oft genau die Einstiegszone für Trades in Trendrichtung.' },
          { q: 'Wo liegt typischerweise viel Liquidität?', a: ['Über alten Hochs und unter alten Tiefs', 'In der Mitte einer Range', 'Genau am Tagesöffnungskurs'], ok: 0, why: 'Dort sammeln sich Stops und Pending Orders anderer Marktteilnehmer.' },
        ],
      },
      {
        id: 'management', title: 'Trade-Management: festes Ziel statt Bauchgefühl',
        goal: 'Du managst Trades nach festen Regeln und vergleichst Varianten nur mit Daten.',
        body: `
          <p>Die meisten Trader verlieren Edge nicht beim Einstieg, sondern beim Management: zu früh raus, Stop zu früh auf Breakeven, Ziel nachträglich verschoben.</p>
          <ul>
            <li>Deine Regel: <b>komplett schließen am TP</b>, Ziel abhängig vom Setup (Trend ≥ 2 R, Scale-in 1,5–2 R, Pullback 1,5 R).</li>
            <li>Ein Stop auf Breakeven senkt Verluste, kappt aber auch viele Gewinner, die vorher noch einmal zurückkommen. Ob es sich lohnt, zeigt nur deine eigene Statistik.</li>
            <li>„Nicht an SL oder TP“ geschlossen? Das ist ein Management-Eingriff. Markiere ihn im Journal mit einem Fehler-Tag, wenn er nicht geplant war.</li>
          </ul>`,
        rule: 'Nach dem Einstieg wird nicht mehr nachgedacht, nur noch ausgeführt.',
        task: 'Filtere im Journal nach Trades, die „nicht an SL oder TP“ geschlossen wurden. Wie viel R hätten sie mit Plan gebracht?',
        links: [['index.html', 'Journal']],
        quiz: [
          { q: 'Ein Trade steht bei +1,4 R, Ziel ist 2 R. Du wirst nervös. Was sagt dein Playbook?', a: ['Laufen lassen bis TP oder SL', 'Sofort schließen, Gewinn ist Gewinn', 'Stop auf Einstand ziehen'], ok: 0, why: 'Vorzeitiges Schließen senkt den durchschnittlichen Gewinner – und damit den Erwartungswert.' },
          { q: 'Wie entscheidest du, ob Breakeven-Stops sinnvoll sind?', a: ['Mit einem Vergleich in Backtest oder Journal', 'Nach Gefühl', 'Immer nutzen, sicher ist sicher'], ok: 0, why: 'Ob Breakeven hilft, hängt vom Setup ab. Nur Daten aus deinen eigenen Trades zeigen es.' },
        ],
      },
    ],
  },
  {
    key: 'psyche', title: 'Psychologie & Disziplin', phase: 'Phase 2',
    intro: 'Die Regeln kennst du. Dieses Modul sorgt dafür, dass du sie auch dann befolgst, wenn es unangenehm wird.',
    lessons: [
      {
        id: 'wahrscheinlichkeiten', title: 'Denken in Wahrscheinlichkeiten',
        goal: 'Du bewertest Entscheidungen nach Prozess, nicht nach dem Ergebnis des einzelnen Trades.',
        body: `
          <p>Ein guter Trade kann verlieren, ein schlechter gewinnen. Wer jedes Ergebnis persönlich nimmt, ändert nach Verlusten seine Regeln – und zerstört damit seinen Edge.</p>
          <ul>
            <li>Jeder Trade ist <b>einer von 100</b>. Sein Ergebnis ist für sich genommen unwichtig.</li>
            <li>Trenne <b>Entscheidungsqualität</b> (Prozess-Score) von <b>Ergebnis</b> (R). Ein Verlust mit Score 3 ist ein guter Trade.</li>
            <li>Gewinner mit Score 0–1 sind gefährlich: Sie belohnen falsches Verhalten.</li>
          </ul>
          <p>Lese-Empfehlung: Mark Douglas, <i>Trading in the Zone</i>.</p>`,
        rule: 'Ich kontrolliere den Prozess, nicht das Ergebnis.',
        task: 'Vergib für deine letzten 10 Trades nachträglich einen Prozess-Score. Wie viele Gewinner hatten Score < 3? Wie viele Verlierer Score 3?',
        links: [['index.html', 'Journal']],
        quiz: [
          { q: 'Ein Trade nach Playbook mit korrektem Risiko verliert 1 R. Wie bewertest du ihn?', a: ['Guter Trade – Prozess-Score 3', 'Schlechter Trade', 'Regeln anpassen'], ok: 0, why: 'Der Prozess war richtig. Verluste gehören zum System.' },
          { q: 'Warum ist ein Gewinner mit Regelbruch gefährlich?', a: ['Er verstärkt falsches Verhalten', 'Er erhöht die Steuern', 'Er ist nicht gefährlich'], ok: 0, why: 'Das Gehirn lernt aus Belohnungen. Gewinne aus Regelbrüchen machen weitere Regelbrüche wahrscheinlicher.' },
        ],
      },
      {
        id: 'tilt', title: 'Tilt erkennen und stoppen',
        goal: 'Du erkennst emotionale Ausnahmezustände früh und hörst auf, bevor sie Geld kosten.',
        body: `
          <p><b>Tilt</b> ist der Zustand, in dem Emotionen die Entscheidungen übernehmen: Rache-Trades, zu große Positionen, Setups außerhalb des Playbooks.</p>
          <p>Typische Warnsignale:</p>
          <ul>
            <li>Du schaust öfter auf den Chart, als dein Setup es erfordert.</li>
            <li>Du suchst nach einem Verlust sofort den nächsten Trade.</li>
            <li>Du denkst in Geld statt in R („ich muss die 300 € zurückholen“).</li>
            <li>Körperliche Anspannung, Ärger, Hektik.</li>
          </ul>
          <p>Deshalb gibt es <b>harte Stop-Regeln</b>, die du vorher festlegst – im Zustand selbst entscheidest du schlecht. Der Mentoring-Tab zeigt dir jeden Tag, ob eine greift.</p>`,
        rule: 'Die Stop-Regel entscheidet, nicht meine Stimmung.',
        task: 'Schreibe deine drei persönlichen Tilt-Warnsignale auf. Lege fest, was du stattdessen tust (z. B. Laptop zu, 20 Minuten raus).',
        links: [['mentoring.html', 'Heute handeln?']],
        quiz: [
          { q: 'Nach zwei Verlusten siehst du ein „perfektes“ drittes Setup. Was gilt?', a: ['Stop-Regel: heute kein weiterer Trade', 'Handeln, es ist ja perfekt', 'Mit doppeltem Risiko handeln'], ok: 0, why: 'Gerade nach Verlusten wirken Setups perfekter, als sie sind. Die Regel schützt vor genau diesem Moment.' },
          { q: 'Welcher Gedanke ist ein klares Tilt-Signal?', a: ['„Ich muss das heute zurückholen“', '„Mein Setup ist noch nicht da“', '„Ich warte auf den 15M-Trigger“'], ok: 0, why: 'Zurückholen-Wollen verschiebt den Fokus vom Prozess auf das Geld.' },
        ],
      },
      {
        id: 'regelbruch', title: 'Warum wir Regeln brechen – und Wenn-dann-Pläne',
        goal: 'Du hast für deine häufigsten Regelbrüche fertige Gegenmaßnahmen.',
        body: `
          <p>Regelbrüche passieren selten aus Unwissen, sondern in bestimmten Situationen: Langeweile, Angst etwas zu verpassen (FOMO), Ärger nach Verlusten, Euphorie nach Gewinnen.</p>
          <p><b>Wenn-dann-Pläne</b> verknüpfen eine Situation mit einer festen Handlung. Sie wirken, weil du im Moment nicht mehr entscheiden musst:</p>
          <ul>
            <li>Wenn ich einen Trade ohne Alarm eröffnen will, dann schreibe ich erst die Playbook-Bedingungen ins Journal.</li>
            <li>Wenn ein Trade läuft und ich ihn schließen will, dann schließe ich den Chart für 30 Minuten.</li>
            <li>Wenn ich einen Regelbruch begangen habe, dann handele ich morgen nicht und mache ein Review.</li>
          </ul>`,
        rule: 'Für jeden typischen Fehler gibt es einen fertigen Wenn-dann-Plan.',
        task: 'Sieh dir deine Fehler-Tags im Journal an. Schreibe für die zwei häufigsten je einen Wenn-dann-Plan und hänge sie neben den Monitor.',
        links: [['index.html', 'Journal']],
        quiz: [
          { q: 'Warum wirken Wenn-dann-Pläne besser als gute Vorsätze?', a: ['Die Entscheidung ist schon vorher gefallen', 'Sie sind länger formuliert', 'Sie gelten nur für Gewinner'], ok: 0, why: 'In Stresssituationen fehlt die Kraft für gute Entscheidungen. Ein vorher festgelegter Plan muss nur noch ausgeführt werden.' },
          { q: 'Welche Situation führt häufig zu FOMO-Trades?', a: ['Ein Paar läuft ohne dich stark in deine Richtung', 'Ein ruhiger Markt ohne Setups', 'Das Wochenende'], ok: 0, why: 'Die Angst, eine Bewegung zu verpassen, verleitet zu späten Einstiegen ohne Setup.' },
        ],
      },
    ],
  },
  {
    key: 'review', title: 'Review & Verbesserung', phase: 'Phase 2–3',
    intro: 'Trader werden nicht durch mehr Trades besser, sondern durch ausgewertete Trades.',
    lessons: [
      {
        id: 'journal', title: 'Ein Journal, aus dem man lernt',
        goal: 'Jeder Trade hat die Angaben, die du später für eine Auswertung brauchst.',
        body: `
          <p>Ein Journal ist nur so gut wie seine Daten. Pflicht für jeden Trade:</p>
          <ul>
            <li><b>Setup-Typ</b> (Trend, Pullback, Scale-in) – sonst kannst du Setups nicht vergleichen.</li>
            <li><b>Stop und Ziel</b> – sonst gibt es keinen echten R-Wert (Importe ohne SL sind nur geschätzt).</li>
            <li><b>Prozess-Score</b> und, falls nötig, <b>Fehler-Tag</b>.</li>
            <li><b>Screenshot</b> vor dem Einstieg: Er zeigt, was du wirklich gesehen hast, nicht was du hinterher denkst.</li>
            <li>Ein Satz zum Gefühl: ruhig, ungeduldig, ängstlich?</li>
          </ul>`,
        rule: 'Ein Trade ist erst fertig, wenn er dokumentiert ist.',
        task: 'Ergänze bei den Importen der letzten 30 Tage Setup-Typ, Stop und Prozess-Score (Journal → „ergänzen“).',
        links: [['index.html', 'Journal']],
        quiz: [
          { q: 'Warum ist der Screenshot vor dem Einstieg so wertvoll?', a: ['Er zeigt die Entscheidungsgrundlage ohne Rückschaufehler', 'Er macht das Journal schöner', 'Propfirms verlangen ihn'], ok: 0, why: 'Hinterher erinnern wir uns anders. Der Screenshot hält fest, was du zum Zeitpunkt der Entscheidung wusstest.' },
          { q: 'Was fehlt, wenn ein Trade keinen Stop im Journal hat?', a: ['Der echte R-Wert', 'Die Lotgröße', 'Nichts Wichtiges'], ok: 0, why: 'Ohne Stop lässt sich das Risiko nicht berechnen – und damit auch kein R.' },
        ],
      },
      {
        id: 'auswertung', title: 'Wochen- und Monatsreview',
        goal: 'Du findest in deinen Daten, was Geld bringt und was Geld kostet.',
        body: `
          <p><b>Wochenreview (Sonntag, 2 × 25 Min):</b></p>
          <ol>
            <li>Zahlen: Trades, R, Regeltreue.</li>
            <li>Regelbrüche: Was, wann, warum?</li>
            <li>Ein Lernpunkt für nächste Woche.</li>
            <li>Kalender: Welche Termine (Notenbanken, Inflation, Arbeitsmarkt) betreffen deine Paare?</li>
          </ol>
          <p><b>Monatsreview (60 Min):</b> Erwartungswert nach Setup, Paar und Wochentag. Suche das Element, das am meisten R kostet. Das ist dein größter Hebel – meist größer als ein neues Setup.</p>`,
        rule: 'Streiche erst das Schlechteste, bevor du Neues hinzufügst.',
        task: 'Mache dein erstes Wochenreview nach diesem Schema und schreibe den Lernpunkt als Tagesnotiz ins Planungsmodul.',
        links: [['dashboard.html', 'Übersicht'], ['mentoring.html', 'Mentoring']],
        quiz: [
          { q: 'Dein Pullback-Setup hat −0,2 R Erwartungswert über 40 Trades, Trend-Setups +0,5 R. Was ist der erste Schritt?', a: ['Pullbacks pausieren und Trend-Setups weiter handeln', 'Ein neues Setup suchen', 'Das Risiko bei Pullbacks erhöhen'], ok: 0, why: 'Das Weglassen eines verlustreichen Setups verbessert den Gesamterwartungswert sofort.' },
          { q: 'Was gehört nicht ins Wochenreview?', a: ['Neue Indikatoren ausprobieren', 'Regelbrüche analysieren', 'Termine der kommenden Woche prüfen'], ok: 0, why: 'Das Review dient der Auswertung. Neue Ideen kommen auf die Parkliste.' },
        ],
      },
      {
        id: 'testen', title: 'Eine Änderung richtig testen',
        goal: 'Du änderst dein System nur noch, wenn Daten es belegen.',
        body: `
          <p>Der Weg einer Änderung:</p>
          <ol>
            <li><b>Hypothese</b> in einem Satz: „Ziele bei Pullbacks auf 2 R statt 1,5 R erhöhen den Erwartungswert.“</li>
            <li><b>Backtest</b> auf historischen Daten, getrennt von Live-Trades (Backtest-Tab).</li>
            <li><b>Forward-Test</b> mit kleinem Risiko oder auf Demo.</li>
            <li>Erst dann <b>übernehmen</b> – und zwar nur diese eine Änderung im nächsten Block.</li>
          </ol>
          <p>Vorsicht <b>Overfitting</b>: Je mehr Regeln du an die Vergangenheit anpasst, desto besser sieht der Backtest aus und desto schlechter funktioniert es live. Einfache Regeln sind robuster.</p>`,
        rule: 'Pro Block genau eine Änderung – getestet, nicht geglaubt.',
        task: 'Nimm die erste Idee von deiner Parkliste. Formuliere sie als Hypothese und lege dafür einen Backtest mit 30 Trades an.',
        links: [['backtest.html', 'Backtest']],
        quiz: [
          { q: 'Ein Backtest mit 12 Spezialregeln zeigt +1,2 R pro Trade. Was ist wahrscheinlich?', a: ['Overfitting – live wird es deutlich schlechter', 'Ein extrem starker Edge', 'Ein Fehler im Chart'], ok: 0, why: 'Viele angepasste Regeln beschreiben die Vergangenheit, nicht die Zukunft.' },
          { q: 'Warum nur eine Änderung pro Block?', a: ['Damit du weißt, was die Wirkung verursacht hat', 'Weil mehr nicht ins Journal passt', 'Weil Propfirms das verlangen'], ok: 0, why: 'Bei mehreren Änderungen gleichzeitig ist unklar, welche geholfen oder geschadet hat.' },
        ],
      },
    ],
  },
  {
    key: 'fundamental', title: 'Fundamentals als Filter', phase: 'Phase 3',
    intro: 'Fundamentals liefern dir die Richtung und warnen vor Terminen. Für den Einstieg bleibt das Chart-Setup zuständig.',
    lessons: [
      {
        id: 'bias', title: 'Fundamentaler Bias in 15 Minuten',
        goal: 'Du kennst für jede Hauptwährung die grobe Richtung und weißt, welche Termine sie bewegen.',
        body: `
          <p>Ein Bias ist eine Einschätzung, ob eine Währung eher stärker oder schwächer wird – getrieben vor allem von <b>Zinserwartungen</b>. Die Überraschung zählt, nicht die Zahl selbst.</p>
          <ul>
            <li>Für jede Währung: Wie steht die Notenbank? Wohin gehen Inflation und Arbeitsmarkt?</li>
            <li>Kombiniere eine <b>starke mit einer schwachen</b> Währung – dort laufen Trends am saubersten.</li>
            <li><b>Termine</b> mit hoher Wirkung (Zinsentscheide, Inflation, Arbeitsmarkt) vorher im Kalender markieren. Kein neuer Einstieg kurz davor.</li>
          </ul>
          <p>Die Wissen-Seite erklärt jeden dieser Bausteine im Detail.</p>`,
        rule: 'Fundamentals filtern, das Chart-Setup entscheidet.',
        task: 'Lies auf der Wissen-Seite „Erwartung schlägt Ergebnis“ und „Inflation und Zinsentscheid“. Notiere danach für 8 Hauptwährungen stark / neutral / schwach.',
        links: [['lernen.html#erwartung-vs-ist', 'Erwartung vs. Ergebnis'], ['lernen.html#inflation-zins', 'Inflation & Zins'], ['cockpit.html', 'Cockpit']],
        quiz: [
          { q: 'USD ist fundamental stark, JPY schwach. Welches Setup passt zum Bias?', a: ['USDJPY long', 'USDJPY short', 'Keines'], ok: 0, why: 'Starke Währung kaufen, schwache verkaufen: USDJPY long.' },
          { q: 'In 30 Minuten kommen US-Inflationsdaten. Dein Setup auf EURUSD ist da. Was tust du?', a: ['Nach den Daten neu bewerten', 'Sofort einsteigen', 'Mit doppeltem Risiko einsteigen'], ok: 0, why: 'Vor wichtigen Daten sind Spreads und Sprünge unberechenbar, und das Setup kann sich danach komplett ändern.' },
        ],
      },
      {
        id: 'korrelation', title: 'Korrelation und Währungs-Exposure',
        goal: 'Du siehst dein Risiko pro Währung, nicht nur pro Paar.',
        body: `
          <p>Viele Paare bewegen sich ähnlich, weil sie eine Währung teilen. EURUSD long, GBPUSD long und AUDUSD long sind im Kern <b>ein großer USD-Short</b>. Kommt eine USD-Überraschung, verlieren alle drei gleichzeitig.</p>
          <ul>
            <li>Deine Regel <b>max. 1 Position pro Währung</b> begrenzt dieses Klumpenrisiko.</li>
            <li>Auch Risikostimmung verbindet Paare: AUD, NZD und CAD fallen oft gemeinsam bei Risk-off, JPY und CHF steigen.</li>
            <li>Vor einem neuen Trade fragen: Welche Währungen bin ich bereits long oder short?</li>
          </ul>`,
        rule: 'Drei korrelierte Trades sind ein Trade mit dreifachem Risiko.',
        task: 'Prüfe deine Trades der letzten 3 Monate: Wie oft hattest du zwei Positionen mit derselben Währung gleichzeitig offen? Wie liefen diese Tage?',
        links: [['index.html', 'Journal'], ['lernen.html#risk-on-off', 'Risk-on / Risk-off']],
        quiz: [
          { q: 'Du bist EURUSD long. Welcher zusätzliche Trade erhöht dein USD-Risiko am stärksten?', a: ['GBPUSD long', 'EURJPY long', 'AUDNZD short'], ok: 0, why: 'GBPUSD long ist ebenfalls ein USD-Short – zusammen mit EURUSD long doppeltes USD-Risiko.' },
          { q: 'Welche Währungen sind bei Risk-off typischerweise gefragt?', a: ['JPY und CHF', 'AUD und NZD', 'NOK und CAD'], ok: 0, why: 'In Krisen fließt Geld in sichere Häfen wie Yen und Franken.' },
        ],
      },
    ],
  },
  {
    key: 'skalierung', title: 'Skalierung & Business', phase: 'Phase 4',
    intro: 'Wenn der Prozess stabil ist, wächst das Kapital – nicht das Risiko pro Trade.',
    lessons: [
      {
        id: 'skalieren', title: 'Skalieren ohne mehr Risiko',
        goal: 'Du erhöhst verwaltetes Kapital erst, wenn klare Kriterien erfüllt sind.',
        body: `
          <p>Skalieren heißt: <b>mehr Kapital bei gleichem Prozentrisiko</b>. Mehr Prozent pro Trade ist keine Skalierung, sondern mehr Risiko.</p>
          <ul>
            <li>Kriterien vor dem nächsten Schritt: 3 profitable Monate in Folge und Regeltreue ≥ 95 %.</li>
            <li>Kapital auf <b>2–3 Firmen verteilen</b>: Regeländerungen oder Probleme bei einer Firma treffen dich nicht komplett.</li>
            <li>Gleiche Trades auf mehreren Konten multiplizieren auch die Verluste. Plane die Summe aller Konten als ein Risiko.</li>
            <li>Neue Challenges nur aus Payouts bezahlen – so finanziert sich das Wachstum aus dem Edge.</li>
          </ul>`,
        rule: 'Erst die Kriterien, dann das Kapital.',
        task: 'Prüfe im Mentoring-Tab die Zielkarten. Schreibe auf, welche Kriterien dir bis zur nächsten Skalierungsstufe noch fehlen.',
        links: [['mentoring.html', 'Ziele'], ['business.html', 'Business']],
        quiz: [
          { q: 'Du hast 2 Monate Gewinn. Ist es Zeit, das Risiko auf 1,5 % zu erhöhen?', a: ['Nein – erst Kriterien erfüllen und dann Kapital erhöhen, nicht das Risiko', 'Ja, es läuft', 'Ja, aber nur bei A+-Setups'], ok: 0, why: 'Skalierung bedeutet mehr Kapital bei gleichem Risiko. Höheres Risiko vergrößert vor allem die Drawdowns.' },
          { q: 'Warum mehrere Propfirms?', a: ['Um das Risiko einer einzelnen Firma zu streuen', 'Weil man so mehr Trades machen darf', 'Wegen niedrigerer Spreads'], ok: 0, why: 'Ändert eine Firma Regeln oder Auszahlungen, ist nicht dein ganzes Kapital betroffen.' },
        ],
      },
      {
        id: 'business', title: 'Trading als Business führen',
        goal: 'Du kennst Kosten, Einnahmen und deinen echten Gewinn pro Monat.',
        body: `
          <p>Ein Top-Trader führt sein Trading wie ein Unternehmen:</p>
          <ul>
            <li><b>Kosten:</b> Challenges, Daten, Tools. Jede Ausgabe muss sich über den Edge rechnen.</li>
            <li><b>Einnahmen:</b> Payouts, sauber gebucht und abgerechnet.</li>
            <li><b>Kennzahl:</b> Payouts minus Kosten pro Monat. Ein großer Gewinn bei noch größeren Challenge-Kosten ist ein Verlustgeschäft.</li>
            <li><b>Zeit:</b> Wie viele Stunden pro Woche investierst du? Rechnet sich dein Stundensatz?</li>
          </ul>`,
        rule: 'Nur was nach allen Kosten übrig bleibt, ist Gewinn.',
        task: 'Sieh dir im Business-Tab Einnahmen und Ausgaben der letzten 12 Monate an. Berechne: Wie viel kostet dich eine bestandene Challenge im Schnitt?',
        links: [['business.html', 'Business'], ['accounting.html', 'Buchungen']],
        quiz: [
          { q: 'Du hattest 1.200 € Payouts und 1.500 € Challenge-Kosten im Jahr. Wie steht dein Trading-Business?', a: ['−300 €: noch nicht profitabel', '+1.200 €: profitabel', 'Kann man nicht sagen'], ok: 0, why: 'Payouts minus Kosten ergeben das echte Ergebnis.' },
          { q: 'Wie finanzierst du neue Challenges am sinnvollsten?', a: ['Aus Payouts', 'Aus dem Haushaltsbudget nach Verlusten', 'Auf Kredit'], ok: 0, why: 'So wächst das Business nur aus nachgewiesenem Edge.' },
        ],
      },
    ],
  },
];

export const ALL_LESSONS = MODULES.flatMap(m => m.lessons.map(l => ({ ...l, module: m.key, moduleTitle: m.title })));
