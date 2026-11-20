# Lab 5 C-04 — live Gather workflow

Passed on 20 November 2026 at 14:31 Asia/Bangkok against [the synthetic public event](https://gather-75thi3dqbq-as.a.run.app/events/de6bc9f8-7c7f-4358-8759-9d0ce25de02f). Cloud Run revision `gather-00001-5s8` was serving 100% of traffic. The deployed source was [4a7819b](https://github.com/PhraewaS/event-system/commit/4a7819b7b6107b8ae3ea88284c58dd18e1812136), recorded in the [first deployment evidence](https://github.com/PhraewaS/event-system/issues/45#issuecomment-7009398933).

| Step | Verified result | Screenshot |
| --- | --- | --- |
| Organizer sign-in and publish | The Organizer signed in and published one synthetic event with capacity 1. HTTP 201. | [Publication confirmation](01-organizer-published.jpg) |
| Participant sign-in and registration | The Participant signed in and reserved a place. HTTP 201. The reservation was still present after reload. | [Confirmed reservation](02-participant-confirmed.jpg) |
| Organizer roster | The owner saw the demo Participant with 1 registered, 0 places left, and total capacity 1. | [Owner roster](03-owner-roster.jpg) |
| Capacity rejection | A second Participant saw `Fully booked` and a disabled registration button. The registration API responded `409 EVENT_FULL`, and the roster stayed at 1. | [Capacity rejection](04-capacity-rejection.jpg) |

[Run record](results.json) contains statuses, exact screenshot URLs, capture times, checksums, and the inspected image digest. The URL above each screenshot is the address captured by the browser at that step. Each account and event shown is synthetic. The workflow used fresh browser contexts in Cloud Shell and the existing demo credential in process memory.

Issue [#45](https://github.com/PhraewaS/event-system/issues/45) and parent [#7](https://github.com/PhraewaS/event-system/issues/7) remain open.
