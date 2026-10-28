# Pikva presentation script

Deck: `docs/Pikva-Demo.pptx` (18 slides). Speaker notes are also inside the deck.

**Total time:** about 25 minutes. Slides 1–14 take about 11 minutes, the live demo about 8, the business model and roadmap about 5, questions after.

**How to read this:** plain text is what you say. *Italics in brackets* are things you do. Numbers marked **(confirm)** are proposals you must check or change before presenting.

---

## Before you start (10 minutes earlier)

- Backend, Redis and `bun dev` are running. Open `http://localhost:3000`.
- Three browser windows, one per role, so the sessions don't sign each other out:
  - **Admin:** Ada Obi, `ada.obi@sunriseacademy.example.com`
  - **Parent:** Ngozi Eze, `ngozi.eze@example.com`
  - **Gate:** Sule Bello, `sule.bello@sunriseacademy.example.com`
  - The shared demo password is in `state.json` in the Claude scratchpad folder (not in this repo). Ask for it if you need it.
- A portrait photo ready on the desktop for the upload step.
- The deck open in presentation mode, with the browser windows ready to switch to.
- Restart the backend and `bun dev`, and delete `FRONTEND\.next\dev`, if anything looks stale.

---

## Part 1: The story (slides 1–4, about 3 minutes)

### Slide 1: Title

> Good morning. I'm presenting **Pikva**, a school pickup management system.
> The idea is in one line: **send every child home with the right person.**
> Four words describe how it works: authorise, approve, verify, record.
> Everything you will see is the real running application, with demo data.

### Slide 2: Pickup is the riskiest minute of the school day

> Think about what happens at a school gate at closing time. Many children, many adults, and staff relying on a familiar face or a name on a list.
> Pikva makes three promises.
> **One: only authorised people.** Parents name who may collect, and the school approves each person before they ever can.
> **Two: every handover is verified.** A single-use daily code, shown as text and a QR code, checked at the gate against a photo.
> **Three: nothing goes unrecorded.** We know who collected, who released, and when. Failed attempts raise alerts straight away.
> Today it's a name on a list. With Pikva it's a rule the whole school follows.

### Slide 3: How a pickup works

> Here is the full journey in five steps.
> The **parent** adds a pickup person with a photo. The **school admin** reviews and approves. The **parent** gets today's one-time code. **Gate staff** check the code and match the face to the photo. The pupil is released and it's all logged.
> Step four is highlighted because it's the moment that matters. I'll show you each step live in a few minutes.

### Slide 4: One platform, three people

> There are three roles on one platform.
> The **school admin** runs the setup, on a laptop. The **parent** works mostly from a phone. **Gate staff** use a phone or tablet at the gate.
> After sign-in, each person lands on their own home and sees only their own menu.

---

## Part 2: Product tour (slides 5–13, about 8 minutes)

### Slide 5: A clear front door

> This is the landing page and sign-in. It explains Pikva in one screen.
> There is no public sign-up page. Schools are set up by us, and the school then adds its own parents and gate staff.

### Slide 6: School admin dashboard

> This is what the school administrator sees first.
> The cards show pupils, active pickup people and pickups today. The yellow banner says two people are waiting for approval. The bell shows open security alerts. The alerts also play a sound and send a push notification.
> Below, today's pickups: who was collected, by whom, and which staff member released them.

### Slide 7: Parent on a phone

> This is the parent's experience, on a phone.
> **First**, an overview of their children and each child's pickup people.
> **Second**, adding a pickup person: name, phone number, dates, and a photo from the phone.
> **Third**, getting today's code. It's a one-time code in text, plus a QR code, for the gate.

### Slide 8: Approvals

> This is our second safeguard. A parent account can't create a valid pickup person on its own.
> Each request shows the photo, which pupil they'd collect, who sent it and how to call them. The admin approves or declines in one tap.
> Until approved, that person cannot collect, and no code can be issued for them.

### Slide 9: Gate verification

> This is the gate. Green means go, red means stop.
> Staff type the code or scan the QR. The screen shows the pupil and the pickup person's photo. They compare the face in front of them, then release, or refuse.
> If they refuse, the code is cancelled so it can't be used at another gate. A wrong or reused code is blocked and raises an alert.

### Slide 10: Alerts and audit log

> Every failure raises an alert. A wrong code, a refusal or repeated failed attempts reach admins by email and push notification, and stay on screen until someone resolves them.
> The audit log records who did what and when. It is read-only, so nobody can quietly rewrite history from inside the app.

### Slide 11: Pupils and pickup people

> The admin manages pupils and pickup people in one place.
> Pupils can be searched by pupil or parent name, with the parent's contact details. Pickup people can be filtered by status. The admin can edit dates, deactivate or reactivate.
> Admins can manage pickup people, but only parents can add them. That keeps the parent in control.

### Slide 12: Pickup history

> Every pickup is on the record, with a date filter for the school.
> Parents see their own children's history too, but not the staff member's name. That's deliberate.

### Slide 13: Built for desktop and phone

> It's the same app, sized to the screen. On a laptop you get a sidebar. On a phone it becomes a menu drawer and bottom tabs.

---

## Part 3: Live demo (about 8 minutes)

*Switch to the browser. Keep each step short.*

1. **Parent window.** Open **Pickup People → Add pickup person**. Enter a name (e.g. "Uncle Tunde"), relationship, phone and dates, and upload the portrait.
   > "Notice the badge: **Awaiting approval**. There's no code button yet."
2. **Admin window.** Open **Approvals**. Show the new card with photo and sender, then click **Approve**.
   > "Now the school has vouched for this person."
3. **Parent window.** Refresh. The status is now **Active**. Click **Get today's code** and confirm.
   > "A one-time code and a QR. Any earlier code stops working."
4. **Gate window.** Type a **wrong code** first.
   > "Red, nothing revealed. And this raised an alert."
5. **Gate window.** Type the real code, then check it. Show the green card with both photos. Click **Release**.
   > "Matched, released and recorded."
6. **Gate window.** Click Next pickup and type the same code again.
   > "Already used. One code, one pickup."
7. **Admin window.** Show the dashboard bell, **Security Alerts** (mark one resolved), **Pickup History** and **Audit Log**.
   > "Everything we just did, on the record."

**If something fails:** use the screenshots in the deck. Say: "I'll show the screen from the deck." If the camera fails, use manual code entry. If an email doesn't arrive, say that sending uses a service that needs a verified domain, which is on the roadmap.

---

## Part 4: Trust, business and roadmap (slides 14–18, about 5 minutes)

### Slide 14: Built to be trusted

> Behind the screens, we've invested in quality and security.
> The project has **more than 450 backend tests, more than 200 frontend unit tests and over 20 browser end-to-end tests.**
> Passwords and codes are hashed. Sign-in, gate checks and code requests are rate-limited. Each person sees only their own school's data. And codes are single-use and expire the same day.

### Slide 15: Business model

> Now, how Pikva makes money.
> **The school is the customer.** Parents and gate staff never pay.
> The core revenue is a **per-pupil subscription, charged per term.**
> On top, a **one-off setup and training fee** to onboard the school, import pupils and parents, and train gate staff.
> Later, **add-ons** like SMS alerts, multi-campus schools, and reports.
> A worked example: at **₦600 per pupil per term** *(confirm)*, a school of 300 pupils pays ₦180,000 a term, which is **₦540,000 a year**. These are illustrative figures that we'll validate in the pilot.

*Say this if asked why per pupil:* it scales with the school's size, and it is easy for a proprietor to explain to parents or fold into fees.

### Slide 16: Low cost to serve, simple way to grow

> The cost to serve each extra pupil is small: hosting, email and push notifications, and photo storage, shared across all schools.
> The real cost is **support and onboarding**, which is exactly why there's a setup fee.
> Our growth plan has three steps. **Pilot** one school for a term at a reduced price, with weekly check-ins. **Prove** it with a case study: pickups logged, incidents caught, parent feedback. Then **grow** through school proprietors' networks and referrals.

### Slide 17: Where we are and what comes next

> **Built:** the admin, parent and gate web portals, approvals, codes, QR and photos, alerts by email and push, the audit log, and account management.
> **Before going live:** secure school onboarding, a verified email-sending domain, HTTPS deployment with backups, and showing pupil photos at the gate.
> **Next:** a Flutter mobile app for parents and gate staff, school time zones for code expiry, and a pilot with a real school.
> I'll be honest about the boundary: the web app is complete enough for a supervised pilot. The mobile app and production setup are the next milestones.

### Slide 18: Thank you

> Thank you. Pikva: authorise, approve, verify, record.
> I'm happy to take questions or go back into the live app.

---

## Likely questions and answers

**Is there a mobile app?**
Not yet. The web portal works on phones today, and the Flutter app is the next phase. The backend is already built for it.

**What if a parent loses their phone or someone steals it?**
The admin can deactivate the person or the account immediately. Codes are single-use, expire the same day, and a new code cancels the old one.

**What if the internet is down at the gate?**
Verification needs a connection today. An offline mode is a possible later feature, and it's worth testing connectivity at the pilot school first.

**How do you stop a parent adding a fake pickup person?**
Nobody can collect until the school approves them, and the gate staff compare the face to the photo.

**What about children's data and privacy?**
We store minimal data, scope each school's data separately, and never show parents the staff names. Before going live we'll review Nigerian data-protection requirements and get parental consent wording checked.

**Who can create a school?**
Only us. A small change that locks school sign-up behind a secret key is built on its own branch and will be merged before launch.

**Why would a school pay for this?**
It reduces the risk and liability of releasing a child to the wrong person, it saves gate staff time, and it shows parents the school takes safety seriously.

**How does it differ from paper slips or WhatsApp?**
Those can't prove who authorised someone, can't be checked at the gate against a photo, and leave no reliable record or alert.

**What does it cost to run?**
A small, shared amount per school for hosting, email and storage. Most of the cost is people: onboarding and support.

**What if gate staff make a mistake?**
Everything is logged with the staff member's name, and admins see failed checks and refusals as alerts.

---

## Numbers and claims to confirm before presenting

| Item | Status |
|---|---|
| ₦600 per pupil per term | Illustrative. **Confirm or replace** with your own price after talking to a school. |
| 300-pupil example school | Illustrative. |
| Setup and training fee | No price given in the deck on purpose. Decide an amount. |
| "450+ / 200+ / 20+" tests | Lower bounds from the last full release check. Re-run the suites for exact numbers. |
| "School accounts are created by us" | True for the web app. The API still allows public sign-up until the onboarding-key branch is merged. |
| SMS, multi-campus, reports | Business ideas for later. **Not built.** |
| Mobile app | **Not built.** Planned as a Flutter app. |
