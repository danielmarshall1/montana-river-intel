INSERT INTO river_tactics (river_id, about, character, best_sections, best_months, techniques, regulations_notes) VALUES

-- HENRY'S FORK
((SELECT id FROM rivers WHERE slug = 'henrys-fork-ashton'),
'Voted the number one trout stream in the country by Trout Unlimited, the Henry''s Fork is known as the "Graduate School of Fly Fishing for PhD Trout." Within 30 miles you can nymph pocket water in a lava canyon, sight-cast rising rainbows on a spring creek flat, and drift streamers past aggressive browns in farm-country riffles. Each section demands a completely different approach.',
'Freestone with tailwater influence. 127 miles from Big Springs headwaters to South Fork confluence. Wild rainbow and brown trout. Multiple distinct sections with different character and difficulty. World-class hatch-driven dry fly fishery.',
'[
  {"name": "Box Canyon", "description": "Fast boulder-churned pocket water below Island Park Dam. Best nymphing on the river. Jumbo rainbows in aggressive feeding lies. Non-stop action for anglers who fish heavy and deep."},
  {"name": "Last Chance and Railroad Ranch", "description": "The famous Harriman State Park water. Spring creek character with flat glassy currents and impossibly selective trout. Sight casting to individual rising fish. Most technical dry fly fishing in Idaho. Open June 15 through November 30 only — catch and release, fly fishing only, barbless hooks."},
  {"name": "Below Mesa Falls to Ashton", "description": "Brown trout join rainbows. Classic riffles, rapids and pools. Salmonfly hatch arrives here first in early May and progresses upstream. More accessible and less technical than Railroad Ranch."}
]',
'[
  {"month": "April", "notes": "Early season. BWO and midges. Box Canyon fishing consistently. Railroad Ranch closed until June 15."},
  {"month": "May", "notes": "Salmonfly hatch starts on lower sections early May. Runoff can affect flows. Tailwater Box Canyon stays fishable."},
  {"month": "June", "notes": "Railroad Ranch opens June 15. Green Drake and Brown Drake hatches — most famous hatch event on the river. Best dry fly fishing of the year."},
  {"month": "July", "notes": "PMD, Caddis, Yellow Sally. Railroad Ranch prime time through mid-July. Box Canyon excellent."},
  {"month": "August", "notes": "Hoppers along banks. Trico mornings. Evening Caddis. Fish early before afternoon heat."},
  {"month": "September", "notes": "Railroad Ranch prime again. BWO on overcast days. Excellent fall fishing."},
  {"month": "October", "notes": "Fall BWO. Pre-spawn browns aggressive. Streamers for large fish. Railroad Ranch open through November 30."}
]',
'Hatch matching is everything on the Henry''s Fork — carry a wide selection and study what''s emerging before you cast. Railroad Ranch fish are among the most educated trout in North America — long leaders, fine tippets (6X), drag-free drifts. Box Canyon rewards heavy nymphing in fast pocket water. Salmonfly hatch on lower sections is the easiest big-fish dry fly opportunity on the river.',
'Railroad Ranch (Harriman State Park): catch-and-release, fly fishing only, barbless hooks, open June 15 through November 30 only. Check IDFG regulations for current rules by section. Idaho fishing license required.'),

-- SOUTH FORK SNAKE RIVER
((SELECT id FROM rivers WHERE slug = 'sf-snake-palisades'),
'The South Fork Snake below Palisades Dam is one of the great tailwater fisheries of the West — 64 miles of cold clear water through dramatic canyon scenery holding massive populations of Yellowstone cutthroat, rainbow, and brown trout. Famous for its Salmonfly hatch in late June and spectacular fall streamer fishing. Stays fishable when every other river in the region blows out.',
'Tailwater below Palisades Dam. Large powerful river through Swan Valley and canyon sections. Yellowstone cutthroat dominant with rainbows and browns. Primarily float fishery by drift boat. One of the largest cottonwood stands in the world lines the lower sections.',
'[
  {"name": "Upper South Fork (Swan Valley)", "description": "Most accessible section near Palisades Dam. Good wade fishing along grassy banks and braided channels. Yellowstone cutthroat dominant. Best early season when flows are lower."},
  {"name": "Canyon Section", "description": "Steep canyon walls, dramatic scenery. Highest fish density. Brown trout dominant. Best Salmonfly water. Float fishing required — Class II with no significant rapids but requires attentive rowing."},
  {"name": "Lower South Fork (Cottonwood Bottoms)", "description": "River widens through enormous cottonwood stands. Best fall streamer water as browns pre-spawn. Less pressure than upper sections. Early season only before water warms."}
]',
'[
  {"month": "April", "notes": "Tailwater advantage — fishable while freestones blow out. BWO and midges. Cold water, fish subsurface."},
  {"month": "May", "notes": "Excellent BWO and early Caddis. Flows rising with snowmelt but tailwater stays clearer."},
  {"month": "June", "notes": "Salmonfly hatch — late June, progresses upstream. Best dry fly event of the year. Green Drakes follow."},
  {"month": "July", "notes": "PMD, Caddis, hoppers. Prime summer fishing. Float trips peak."},
  {"month": "August", "notes": "Hoppers along grassy banks. Evening Caddis. Watch water temps in lower sections."},
  {"month": "September", "notes": "Fall transition. Browns becoming aggressive. Streamers starting to produce."},
  {"month": "October", "notes": "Best streamer month. Pre-spawn browns in canyon section. Dark articulated patterns along cut banks."}
]',
'Float fishing is the most effective and practical approach — drift boat or raft for the canyon section. Salmonfly hatch requires precise timing — watch water temps and local shop reports. Fall streamer fishing for pre-spawn browns is the hidden gem of the South Fork. Guiding prohibited on South Fork Boise but not South Fork Snake.',
'Check IDFG regulations for current rules. Yellowstone cutthroat are catch-and-release in some sections. Idaho fishing license required.'),

-- SILVER CREEK
((SELECT id FROM rivers WHERE slug = 'silver-creek-picabo'),
'Silver Creek is one of the most technically demanding and rewarding spring creeks in North America — a slow gin-clear stream that attracts fly fishers from around the world seeking its large selective brown and rainbow trout. The Nature Conservancy preserves much of the best water. Patience and precision are mandatory.',
'Spring creek character. Slow clear water with abundant aquatic vegetation. Large selective brown and rainbow trout. Challenging technical dry fly fishing. The Nature Conservancy preserve protects the best sections.',
'[
  {"name": "TNC Preserve (Point of Rocks to Stalker Creek)", "description": "The most famous and productive section. Slow glassy currents, large visible fish. Requires permit from The Nature Conservancy. Catch-and-release only. The most technical spring creek fishing in Idaho."},
  {"name": "Below Highway 20", "description": "More accessible, open sections. Still excellent fishing. BWO and midge hatches. Better option when preserve is crowded or permit unavailable."}
]',
'[
  {"month": "April", "notes": "BWO hatches begin. Early season before crowds arrive. Cold water but fish active midday."},
  {"month": "May", "notes": "Excellent BWO and Pale Morning Dun activity. Some of the best fishing of the year."},
  {"month": "June", "notes": "PMD and Caddis. Evening hatches excellent. Permit required for TNC preserve."},
  {"month": "July", "notes": "Trico mornings — tiny flies, demanding fishing. Evening Caddis and PMD."},
  {"month": "August", "notes": "Trico spinner falls at dawn. Hottest dry fly challenge on the creek."},
  {"month": "September", "notes": "BWO returning. Less pressure. Excellent fall conditions."},
  {"month": "October", "notes": "Fall BWO. Large browns becoming aggressive before spawn."}
]',
'Long fine tippets mandatory — 6X minimum, 7X for educated fish. Approach extremely slowly and low — the water is crystal clear and fish spook easily at any disturbance. Study the hatch before presenting. Trico fishing requires size 20-22 patterns and perfect presentation. This is the most demanding dry fly fishery in Idaho.',
'TNC Preserve requires permit — contact The Nature Conservancy Silver Creek Preserve. Catch-and-release only in preserve. Check IDFG regulations. Idaho fishing license required.'),

-- CLEARWATER RIVER
((SELECT id FROM rivers WHERE slug = 'clearwater-orofino'),
'The Clearwater is famous for two things: giant B-run steelhead in fall and winter, and excellent resident rainbow and cutthroat trout fishing the rest of the year. One of the most powerful rivers in Idaho, draining the vast roadless wilderness of central Idaho. The steelhead run here draws anglers from across the country.',
'Freestone. Large powerful river draining central Idaho wilderness. Wild steelhead October through April. Resident rainbow and cutthroat year-round. Multiple forks with different character.',
'[
  {"name": "Main Stem Clearwater (Orofino area)", "description": "Primary steelhead water. Large pools and long runs where steelhead hold. Access via US-12 which parallels the river. Best fall and winter steelhead fishing."},
  {"name": "North Fork Clearwater", "description": "Excellent resident cutthroat and rainbow. Smaller more intimate water. Good summer dry fly fishing."},
  {"name": "South Fork Clearwater", "description": "Wild cutthroat country. Remote, less pressure. Excellent summer fishing for native fish."}
]',
'[
  {"month": "April", "notes": "Late steelhead possible. Resident trout beginning to feed. BWO hatches starting."},
  {"month": "June", "notes": "Post-runoff transition. Resident trout active. Caddis hatches beginning."},
  {"month": "July", "notes": "Summer fishing peak. Hoppers and dry flies. Cutthroat willing on attractors."},
  {"month": "August", "notes": "Excellent summer fishing. Hoppers and terrestrials. North and South Forks best."},
  {"month": "September", "notes": "First steelhead arriving. Resident trout feeding aggressively before winter."},
  {"month": "October", "notes": "Peak B-run steelhead. Best time to target large steelhead in main stem."},
  {"month": "November", "notes": "Steelhead run continues. Cold but productive for large fish."}
]',
'Steelhead fishing requires spey or switch rod — large powerful river demands long casts. Swinging flies through runs is the traditional approach. Resident trout respond well to attractor dry flies in summer. Barbless hooks required in salmon and steelhead sections.',
'Steelhead and salmon require separate Idaho permits in addition to fishing license. Barbless hooks required in Clearwater drainage for salmon and steelhead. Bull trout catch-and-release. Check IDFG for current steelhead season rules.'),

-- SALMON RIVER
((SELECT id FROM rivers WHERE slug = 'salmon-river-salmon'),
'The Salmon River — the River of No Return — drains more roadless wilderness than any river in the lower 48. Over 400 miles of wild country from its headwaters near Stanley through the Frank Church Wilderness to Riggins. A bucket-list river for serious anglers seeking native cutthroat, steelhead, and Chinook salmon in spectacular remote country.',
'Freestone. One of the longest undammed rivers in the West. Wild Westslope cutthroat, rainbow, steelhead, and Chinook salmon. Remote wilderness character. Multiple sections from accessible valley water to float-only wilderness canyon.',
'[
  {"name": "Upper Salmon (Stanley to Salmon)", "description": "Most accessible section. Highway 75 parallels the river. Native cutthroat and rainbow. Cold clear water from Sawtooth headwaters. Best summer fishing."},
  {"name": "Middle Fork Salmon", "description": "Legendary 100-mile wilderness float. World-class cutthroat fishing in the Frank Church Wilderness. Float trips only — no road access. 6-7 day permits required."},
  {"name": "Lower Salmon (Riggins area)", "description": "Steelhead and Chinook salmon water. Deep canyon. Good resident trout fishing between steelhead seasons."}
]',
'[
  {"month": "April", "notes": "Late steelhead on lower river. Upper river still cold — midges and BWO."},
  {"month": "June", "notes": "Post-runoff transition on upper river. Middle Fork float season beginning late June."},
  {"month": "July", "notes": "Prime cutthroat season on upper river. Middle Fork peak float season. Hoppers and attractor dries."},
  {"month": "August", "notes": "Excellent dry fly fishing on upper river. Hoppers and terrestrials. Middle Fork still running."},
  {"month": "September", "notes": "Fall steelhead arriving on lower river. Upper river browns feeding aggressively."},
  {"month": "October", "notes": "Steelhead peak. Chinook salmon present. Upper river fall fishing excellent."}
]',
'Upper Salmon accessible by wading and floating. Middle Fork requires permitted float trip — apply through the Salmon-Challis National Forest lottery system. Attractor dry flies work well for willing cutthroat. Lower river steelhead fishing requires spey or switch rod.',
'Middle Fork Salmon requires launch permit — lottery through Recreation.gov. Steelhead and Chinook require separate Idaho permits. Bull trout catch-and-release. Check IDFG for current rules.'),

-- SOUTH FORK BOISE RIVER
((SELECT id FROM rivers WHERE slug = 'sf-boise-featherville'),
'The South Fork Boise is Idaho''s best-kept secret — a blue-ribbon tailwater below Anderson Ranch Dam holding some of the largest rainbow trout in the state. Fish in the 14-20 inch range are common, with occasional 30-inch fish in the canyon section. Completely clear year-round. Guiding is prohibited, keeping pressure low.',
'Tailwater below Anderson Ranch Dam. Cold clear water year-round. Large rainbow trout dominant. Canyon section highly productive. Guiding prohibited on this river — truly DIY water.',
'[
  {"name": "Dam to Danskin Bridge", "description": "Most accessible section. Road access throughout. Highest fish density. Best nymphing water. 14-20 inch rainbows common."},
  {"name": "Canyon Section (below Danskin)", "description": "Less pressure, requires float or difficult hike. Best chance at 20+ inch fish. Technical water but very rewarding."}
]',
'[
  {"month": "May", "notes": "Season opens May 23. BWO and Caddis beginning. Excellent early season fishing."},
  {"month": "June", "notes": "Prime month. Caddis and PMD. Clear tailwater while everything else blows out."},
  {"month": "July", "notes": "Summer fishing excellent. Hoppers and terrestrials. Watch afternoon thunderstorm runoff."},
  {"month": "August", "notes": "Hoppers and evening Caddis. Some of the best dry fly fishing of the year."},
  {"month": "September", "notes": "Excellent fall fishing. BWO returning. Less pressure as summer crowds leave."},
  {"month": "October", "notes": "Fall BWO and midges. Pre-spawn browns moving. Good streamer fishing."}
]',
'Guiding is prohibited on the South Fork Boise — this is genuine DIY water with no guided pressure. Nymphing is most consistent throughout the season. Dry fly fishing excellent during Caddis and hopper seasons. Canyon section requires commitment but rewards with larger fish and no crowds.',
'Season typically opens May 23 — check IDFG for current dates. Guiding prohibited on this river. Idaho fishing license required.'),

-- BIG WOOD RIVER
((SELECT id FROM rivers WHERE slug = 'big-wood-hailey'),
'The Big Wood flows through the heart of Sun Valley — accessible, scenic, and surprisingly productive for a river that runs through a ski resort town. Classic freestone water with consistent hatches and good populations of rainbow and brown trout. The Wood River Valley is one of Idaho''s most visited fly fishing destinations.',
'Freestone. Flows through Sun Valley and Ketchum corridor. Rainbow and brown trout. Highway 75 provides excellent access throughout. Good entry-level fishing alongside more technical sections.',
'[
  {"name": "Ketchum to Hailey", "description": "Most popular and accessible section. River runs through town. Good rainbow fishing. Multiple public access points. Best early season before summer heat."},
  {"name": "Hailey to Bellevue", "description": "Wider river, more braided. Brown trout increasing downstream. Less pressure than upper sections. Good hopper water in summer."},
  {"name": "Below Stanton Crossing", "description": "River loses flow as water goes subsurface between Hailey and Stanton. Best section above Stanton for consistent fishing."}
]',
'[
  {"month": "April", "notes": "Early season. BWO and midges. Cold but productive. Watch for rapid runoff onset."},
  {"month": "May", "notes": "Season in full swing. Good Caddis hatches. Watch flows from snowmelt."},
  {"month": "June", "notes": "Post-runoff. PMD and Caddis. River clears quickly. Excellent June fishing."},
  {"month": "July", "notes": "Hoppers and terrestrials. Fish early morning before summer heat. Best dry fly month."},
  {"month": "August", "notes": "Hoppers continue. Watch water temps in afternoon. Fish mornings only when hot."},
  {"month": "September", "notes": "Excellent fall fishing. BWO on overcast days. Less pressure."},
  {"month": "October", "notes": "Fall BWO. Brown trout pre-spawn. Good streamer fishing lower sections."}
]',
'Good beginner to intermediate river — accessible water with willing trout. Elk Hair Caddis, PMD, and hopper patterns cover most situations. Nymphing productive year-round with standard attractor patterns. Water levels critical — check USGS gauge before driving out as river can drop dramatically in late summer.',
'Check IDFG regulations. Some sections may have special rules near Sun Valley. Idaho fishing license required.'),

-- TETON RIVER (IDAHO)
((SELECT id FROM rivers WHERE slug = 'teton-river-newdale'),
'The Teton River on the Idaho side is an underrated gem — a meandering spring-creek-like river flowing through the Teton Valley toward the Henry''s Fork confluence. Large wild brown and rainbow trout in surprisingly intimate water. One of the least pressured quality fisheries in eastern Idaho.',
'Freestone with spring creek influence. Slow meandering character through agricultural valley. Large brown and rainbow trout. Less pressured than neighboring Henry''s Fork. Excellent sight fishing opportunities.',
'[
  {"name": "Upper Teton (near Driggs)", "description": "Most intimate section. Spring creek character. Large browns in undercut banks. Technical presentations required."},
  {"name": "Lower Teton (toward Newdale)", "description": "Wider, more braided. Better access. Float fishing most effective. Browns dominant."}
]',
'[
  {"month": "May", "notes": "Post-runoff transition. BWO and Caddis beginning. Excellent early season fishing."},
  {"month": "June", "notes": "Caddis and PMD. Some of the best dry fly fishing of the year."},
  {"month": "July", "notes": "Hoppers along grassy banks. Excellent summer fishing. Less pressure than Henry''s Fork."},
  {"month": "August", "notes": "Hopper season peak. Sight fishing to large browns in clear water."},
  {"month": "September", "notes": "Excellent fall fishing. Pre-spawn browns aggressive. Best streamer month."},
  {"month": "October", "notes": "Trophy brown trout season. Streamers along undercut banks. Spectacular fall scenery."}
]',
'Spring creek approach works well — light tippets, precise presentations, approach slowly. Hoppers along grassy banks in summer are highly effective. Fall streamer fishing for pre-spawn browns is the hidden highlight of the Teton. Far less pressure than Henry''s Fork for comparable quality fishing.',
'Check IDFG regulations. Idaho fishing license required.'),

-- BOISE RIVER
((SELECT id FROM rivers WHERE slug = 'boise-river-boise'),
'The Boise River is a remarkable urban fishery — tailwater below Lucky Peak Dam running through the heart of Idaho''s capital city. Surprisingly good rainbow and brown trout fishing minutes from downtown Boise. The greenbelt provides extensive public access throughout the urban section.',
'Tailwater below Lucky Peak Dam. Urban fishery through Boise. Rainbow and brown trout. Extensive public access via Boise River Greenbelt. Good entry-level fishery for Boise residents.',
'[
  {"name": "Barber Park to Ann Morrison", "description": "Most popular urban section. Greenbelt access throughout. Good rainbow fishing. Excellent entry point for beginners."},
  {"name": "Above Barber Park", "description": "Less pressure, better fish quality. More technical water. Dam releases affect flows significantly."}
]',
'[
  {"month": "March", "notes": "Early season. Tailwater fishable while other rivers are still frozen. Midges and BWO."},
  {"month": "April", "notes": "BWO hatches. Good early season action. Watch dam release schedules."},
  {"month": "May", "notes": "Caddis and PMD beginning. Flows can fluctuate with irrigation releases."},
  {"month": "June", "notes": "Summer fishing beginning. Evening hatches excellent."},
  {"month": "July", "notes": "Hoppers and terrestrials. Fish early morning before city heat."},
  {"month": "September", "notes": "Fall fishing excellent. BWO on overcast days. Less pressure."},
  {"month": "October", "notes": "Fall BWO and midges. Good streamer fishing for large browns."}
]',
'Great fishery for Boise residents — world-class trout fishing within city limits. Greenbelt provides easy walking access to miles of water. Nymphing most consistent. Evening Caddis hatches can be excellent in summer. Dam releases can change flows dramatically — check USGS gauge before heading out.',
'Check IDFG regulations. Some sections may have special rules. Idaho fishing license required for anyone 14 or older.'),

-- NORTH PLATTE GREY REEF
((SELECT id FROM rivers WHERE slug = 'north-platte-grey-reef'),
'Grey Reef is one of the most productive tailwater fisheries in North America — up to 8,000 trout per mile in the upper sections with fish averaging 16-20 inches and plenty of 5-10 pound fish. The landscape is stark high desert sagebrush, not postcard scenery, but the fishing is world-class. Most surrounding land is private, keeping pressure surprisingly low.',
'Tailwater below Grey Reef Dam. 40-mile section south of Casper. Rainbow and brown trout in extraordinary numbers. High desert sagebrush landscape. Most land private — guided float trips provide best access.',
'[
  {"name": "Upper Grey Reef (below dam)", "description": "Highest fish density — up to 8,000 fish per mile. Best nymphing water. Large rainbows and browns in consistent feeding lies. Most productive section."},
  {"name": "Lower Grey Reef (toward Casper)", "description": "More accessible. Still excellent fishing. Good wade fishing near Casper. Evening Caddis and PMD hatches strong."}
]',
'[
  {"month": "January", "notes": "Tailwater fishes year-round. Midges and scuds. Cold but productive for large fish."},
  {"month": "March", "notes": "Flushing flows sometimes occur — big streamers for aggressive fish during flush."},
  {"month": "April", "notes": "BWO hatches beginning. Spring rainbow spawning run. Excellent nymphing."},
  {"month": "June", "notes": "PMD and Caddis. Some of the best dry fly fishing of the year."},
  {"month": "July", "notes": "Hoppers and terrestrials. Consistent summer fishing."},
  {"month": "August", "notes": "Hopper bite continues. Evening hatches excellent."},
  {"month": "October", "notes": "Pre-spawn browns moving into upper sections. Best streamer fishing of the year."},
  {"month": "November", "notes": "Brown trout spawning run. Egg patterns and streamers. Late season trophy opportunity."}
]',
'Nymphing is the foundation — scuds, worms, midges, and Periwinkle patterns are staples. Guided float trips provide access to most productive private-bank water. Wind is a constant challenge — casting into Wyoming wind requires tight loops and patience. Fall streamer fishing for pre-spawn browns peaks October-November.',
'Wyoming fishing license required. Much of the surrounding land is private — respect boundaries. Guided float trips recommended for first-time visitors to access best water.'),

-- NORTH PLATTE MIRACLE MILE
((SELECT id FROM rivers WHERE slug = 'north-platte-miracle-mile'),
'The Miracle Mile is a 5.5-mile canyon stretch between Kortes Dam and Pathfinder Reservoir — remote, dramatic, and holding 3,200 trout per mile including brown trout exceeding 10 pounds. More accessible than Grey Reef with more public land. Fishes more like a freestone river despite being tailwater.',
'Tailwater between Kortes Dam and Pathfinder Reservoir. Remote canyon location 20 miles from pavement. Rainbow and brown trout 50/50 mix. 3,200 fish per mile. More freestone character than Grey Reef.',
'[
  {"name": "Upper Miracle Mile (below Kortes Dam)", "description": "Best fish density near dam. Large browns and rainbows in technical canyon water. Most remote section."},
  {"name": "Lower Miracle Mile (toward Pathfinder)", "description": "More accessible. Good wade fishing. Brown trout dominant toward reservoir. Annual spawning run November-December."}
]',
'[
  {"month": "April", "notes": "Spring rainbow spawning run underway. Nymphing and streamers."},
  {"month": "June", "notes": "Golden Stone hatch — best dry fly fishing of the year. Big attractor patterns."},
  {"month": "July", "notes": "Caddis, PMD, Yellow Sally. Consistent summer fishing."},
  {"month": "August", "notes": "Hoppers and terrestrials. Flows typically reduced — check before launching."},
  {"month": "September", "notes": "Fall fishing excellent. Pre-spawn browns getting aggressive."},
  {"month": "November", "notes": "Brown trout spawning run from Pathfinder Reservoir. Trophy opportunity. Egg patterns and streamers."},
  {"month": "December", "notes": "Spawning run continues. Cold but worth it for large fish."}
]',
'Remote location requires planning — bring supplies and know that the nearest services are 20 miles away. Golden Stone hatch in June is the highlight dry fly event. Fall spawning run for large browns is the other signature event. More wade fishing opportunity than Grey Reef due to more public land access.',
'Wyoming fishing license required. Under Wyoming law landowners own the river bottom — floating across private land is allowed but wading is not without permission. Check Wyoming Game and Fish for current regulations.'),

-- SNAKE RIVER JACKSON
((SELECT id FROM rivers WHERE slug = 'snake-river-jackson'),
'The Snake River through Jackson Hole is one of the most iconic fly fishing settings in North America — fine-spotted cutthroat trout in the shadow of the Teton Range. The Snake River Fine-Spotted Cutthroat is a distinct subspecies found almost exclusively here. Spectacular scenery combined with willing, aggressive fish.',
'Freestone. Large braided river through Grand Teton National Park and Jackson Hole. Snake River Fine-Spotted Cutthroat dominant. Spectacular Teton scenery. Float fishing most productive.',
'[
  {"name": "Buffalo Fork to Pacific Creek", "description": "Upper section. Most remote and scenic. Cutthroat in pristine condition. Float or wade."},
  {"name": "Deadman''s Bar to Moose", "description": "Classic float through Grand Teton National Park. Spectacular Teton backdrop. Highest cutthroat density. Most popular float section."},
  {"name": "Below Moose to South Park Bridge", "description": "Below the park. More brown trout joining cutthroat. Less scenic but good fishing. Accessible wade fishing at several points."}
]',
'[
  {"month": "June", "notes": "Post-runoff. River clearing. Caddis beginning. Some of the best early season fishing."},
  {"month": "July", "notes": "Prime month. Cutthroat active. Large attractor dries — Elk Hair Caddis, Stimulators. Spectacular scenery."},
  {"month": "August", "notes": "Hoppers along grassy banks. Excellent dry fly fishing. Teton backdrop at its best."},
  {"month": "September", "notes": "Excellent fall fishing. Less pressure. Browns becoming aggressive in lower sections."},
  {"month": "October", "notes": "Fall fishing continues. Large brown trout in lower sections. Streamer fishing productive."}
]',
'Large attractor dry flies are the go-to approach — Royal Wulffs, Elk Hair Caddis, Stimulators, and hopper patterns all work well for aggressive cutthroat. Float fishing through the Teton section provides access to the best water. Cutthroat here are less selective than technical spring creek fish — great confidence builders.',
'Grand Teton National Park sections require park entry fee. Catch-and-release for cutthroat strongly encouraged. Check Wyoming Game and Fish for current regulations. Wyoming fishing license required.'),

-- GREEN RIVER FONTENELLE
((SELECT id FROM rivers WHERE slug = 'green-river-fontenelle'),
'The Green River below Fontenelle Dam is one of Wyoming''s most remote and underrated tailwater fisheries — large brown trout, Snake River cutthroat, and Bonneville cutthroat up to 20 inches in the vast Seedskadee National Wildlife Refuge. 4,000-5,000 fish per mile with almost no pressure due to remote location.',
'Tailwater below Fontenelle Dam. Extremely remote — nearest amenities 25 miles away. Large brown trout, Snake River cutthroat, and Bonneville cutthroat. Seedskadee National Wildlife Refuge provides good public access.',
'[
  {"name": "Top 4 miles (Bureau of Reclamation land)", "description": "Highest fish density near dam. Best cold water. Most accessible section via dam road."},
  {"name": "Seedskadee NWR section", "description": "Willowy meandering character through wildlife refuge. Excellent public access. Brown trout dominant. Good hopper water in summer."}
]',
'[
  {"month": "April", "notes": "Tailwater advantage — clear while other rivers blow out. BWO and midges."},
  {"month": "May", "notes": "Excellent spring conditions. Consistent flows from dam."},
  {"month": "June", "notes": "Caddis and PMD hatches. Summer fishing beginning."},
  {"month": "July", "notes": "Hopper season in prime grasshopper country. Streamers for big browns."},
  {"month": "August", "notes": "Hopper bite peak. Remote and uncrowded. Excellent summer fishing."},
  {"month": "September", "notes": "Fall fishing excellent. Browns pre-spawn becoming aggressive."},
  {"month": "October", "notes": "Trophy brown trout season. Streamers and egg patterns. Kokanee salmon present."}
]',
'Remote location is both the challenge and the reward — plan for no services for the day. Streamers and nymphs for the big fish, hoppers in summer. Kokanee salmon appear in fall, adding unique diversity. Seedskadee NWR provides good walk-in access along the river.',
'Wyoming fishing license required. Plan ahead — no services within 25 miles. Camping available near dam.'),

-- WIND RIVER
((SELECT id FROM rivers WHERE slug = 'wind-river-riverton'),
'The Wind River drains the vast Wind River Range — one of the most spectacular mountain ranges in Wyoming. Excellent freestone fishing for rainbow, brown, and cutthroat trout through remote canyon country and open valley stretches. Less famous than North Platte tailwaters but exceptional wild fish in stunning scenery.',
'Freestone. Large river draining Wind River Range. Rainbow, brown, and cutthroat trout. Mix of canyon and valley character. Some sections flow through Wind River Indian Reservation — check access regulations.',
'[
  {"name": "Upper Wind River (Dubois area)", "description": "Mountain character, cleaner water. Wild cutthroat and rainbow. Spectacular scenery near Ramshorn Peak. Less pressure."},
  {"name": "Wind River Canyon", "description": "Dramatic canyon through Owl Creek Mountains. Large browns in deep pools. US-20 provides access. Excellent fall fishing."},
  {"name": "Below Canyon (Thermopolis area)", "description": "River exits canyon into Wind River Basin. Good public access. Diverse fish populations."}
]',
'[
  {"month": "June", "notes": "Post-runoff. River clearing from top down. Upper sections first."},
  {"month": "July", "notes": "Prime summer fishing. Hoppers and terrestrials. Cutthroat active in upper reaches."},
  {"month": "August", "notes": "Excellent summer fishing. Hoppers along valley banks. Canyon section productive."},
  {"month": "September", "notes": "Excellent fall fishing. Browns in canyon aggressive. Less pressure."},
  {"month": "October", "notes": "Trophy brown trout in canyon. Streamers and large nymphs."}
]',
'Check Wind River Indian Reservation boundaries carefully — some sections require tribal fishing permit in addition to Wyoming license. Canyon section holds the largest fish. Upper river near Dubois excellent for wild cutthroat in remote setting. High elevation means cold water through summer — fish stay active longer.',
'Wind River Indian Reservation fishing permit required for reservation sections — separate from Wyoming license. Contact Eastern Shoshone and Northern Arapaho tribes. Wyoming license required for off-reservation sections.'),

-- SHOSHONE RIVER
((SELECT id FROM rivers WHERE slug = 'shoshone-river-cody'),
'The Shoshone runs from Buffalo Bill Dam through the Wapiti Valley toward Cody — a scenic freestone river in the shadow of the Absaroka Mountains with good populations of brown and rainbow trout. Less famous than Wyoming''s tailwaters but a quality fishery with excellent public access and dramatic western scenery.',
'Freestone below Buffalo Bill Reservoir. Runs through Wapiti Valley toward Cody. Brown and rainbow trout. US-14/16/20 parallels river providing excellent access. Gateway to Yellowstone country.',
'[
  {"name": "North Fork Shoshone (Wapiti Valley)", "description": "Most productive section. Classic freestone pocket water. Brown and rainbow trout. Spectacular Absaroka scenery. Heavy recreation pressure in summer."},
  {"name": "Main Stem (below confluence to Cody)", "description": "Wider, more accessible. Brown trout dominant. Good wade fishing at multiple pullouts. Less pressure than North Fork."}
]',
'[
  {"month": "May", "notes": "Post-runoff beginning. Watch flows carefully — can blow out quickly."},
  {"month": "June", "notes": "Caddis and Golden Stone. River clearing. Good early summer fishing."},
  {"month": "July", "notes": "Prime hopper season. PMD mornings. Excellent summer fishing."},
  {"month": "August", "notes": "Hopper fishing peak. Fish early before afternoon wind."},
  {"month": "September", "notes": "Excellent fall fishing. Browns pre-spawn. Less tourist pressure."},
  {"month": "October", "notes": "Trophy brown trout season. Streamers and large nymphs."}
]',
'Good base camp for Yellowstone-area fishing trips. Hopper fishing in summer excellent. Brown trout in fall respond well to large streamers. Easy access via highway makes this a good option for DIY anglers without a guide or boat.',
'Wyoming fishing license required. Check Wyoming Game and Fish for current regulations. Yellowstone National Park has separate regulations above park boundary.'),

-- BIGHORN RIVER WYOMING
((SELECT id FROM rivers WHERE slug = 'bighorn-river-thermopolis'),
'The Wyoming section of the Bighorn runs from the Wind River Canyon through Thermopolis — a large freestone river with good brown and rainbow trout populations above the famous Montana tailwater section. Hot Springs State Park in Thermopolis provides unique access to thermal spring-influenced water.',
'Freestone in Wyoming section. Large river through Wind River Basin. Brown and rainbow trout. Connects downstream to the famous Montana Bighorn tailwater. Hot Springs State Park provides unique access near Thermopolis.',
'[
  {"name": "Wind River Canyon Exit (near Thermopolis)", "description": "River exits canyon into basin. Good public access. Brown trout dominant. Excellent fall fishing."},
  {"name": "Hot Springs State Park", "description": "Unique thermal influence on water temperatures. Public access through state park. Year-round fishing opportunity."}
]',
'[
  {"month": "May", "notes": "Post-runoff. River clearing from canyon exit. Caddis beginning."},
  {"month": "June", "notes": "Good Caddis and PMD. Summer fishing getting established."},
  {"month": "July", "notes": "Hoppers and terrestrials. Summer peak."},
  {"month": "August", "notes": "Continued hopper fishing. Fish early morning."},
  {"month": "September", "notes": "Excellent fall conditions. Browns becoming aggressive."},
  {"month": "October", "notes": "Trophy brown trout season. Connects with migration from Montana tailwater."}
]',
'Good staging water for the famous Montana Bighorn tailwater downstream. Hot Springs State Park near Thermopolis provides unique year-round access. Fall brown trout fishing excellent before fish migrate downstream to Yellowtail Dam tailwater.',
'Wyoming fishing license required. Check current Wyoming Game and Fish regulations.'),

-- LARAMIE RIVER
((SELECT id FROM rivers WHERE slug = 'laramie-river-laramie'),
'The Laramie River in southeastern Wyoming is a classic high plains freestone river — accessible, relatively uncrowded, and holding good populations of brown and rainbow trout in the Medicine Bow National Forest. A quality alternative to the more famous North Platte tailwaters for anglers in the Laramie/Cheyenne corridor.',
'Freestone. High plains character through Medicine Bow National Forest. Brown and rainbow trout. Good public access in forest sections. Less pressure than North Platte tailwaters.',
'[
  {"name": "Forest Section (above Wheatland Reservoir)", "description": "Best fishing. Medicine Bow National Forest provides extensive public access. Cold mountain water. Wild trout."},
  {"name": "Below Laramie", "description": "More accessible near town. Some private land. Brown trout dominant. Good fall fishing."}
]',
'[
  {"month": "May", "notes": "Season getting underway. Watch runoff from Medicine Bow Mountains."},
  {"month": "June", "notes": "Post-runoff. River clearing. Caddis and PMD beginning."},
  {"month": "July", "notes": "Hoppers and terrestrials. Best summer fishing in forest section."},
  {"month": "August", "notes": "Continued hopper fishing. High elevation keeps water cool."},
  {"month": "September", "notes": "Excellent fall fishing. Browns pre-spawn."},
  {"month": "October", "notes": "Trophy brown trout season. Streamers effective."}
]',
'National Forest sections provide best access and fishing quality. Standard attractor patterns and hoppers work well. Less technical than spring creeks — good confidence-building water. Elevation around 7,000 feet means cool water through summer.',
'Wyoming fishing license required. Medicine Bow National Forest access free. Check Wyoming Game and Fish for current regulations.'),

-- GROS VENTRE RIVER
((SELECT id FROM rivers WHERE slug = 'gros-ventre-jackson'),
'The Gros Ventre is a wild tributary of the Snake River in Jackson Hole — a smaller, less pressured alternative to the Snake with excellent native cutthroat fishing in spectacular Teton scenery. The Gros Ventre Wilderness provides remote fishing opportunities for anglers willing to hike.',
'Freestone. Wild tributary of Snake River. Native Snake River Fine-Spotted Cutthroat. Spectacular scenery in Gros Ventre Wilderness. Less pressure than main Snake River.',
'[
  {"name": "Lower Gros Ventre (near Kelly)", "description": "Most accessible section. Good cutthroat fishing. Float or wade. Connects to Snake River near Jackson."},
  {"name": "Upper Gros Ventre (wilderness)", "description": "Remote hike-in water. Wild cutthroat in pristine condition. Spectacular wilderness scenery. Much less pressure."}
]',
'[
  {"month": "June", "notes": "Post-runoff. River clearing. Caddis beginning. Cutthroat active."},
  {"month": "July", "notes": "Prime cutthroat season. Attractor dries work well. Less pressure than Snake."},
  {"month": "August", "notes": "Hoppers and terrestrials. Excellent summer fishing."},
  {"month": "September", "notes": "Excellent fall fishing. Wild cutthroat feeding before winter."}
]',
'Attractor dry flies most effective for willing cutthroat — Royal Wulffs, Elk Hair Caddis, hoppers. Less technical than Silver Creek or Railroad Ranch. Wilderness sections require planning and bear awareness — grizzly country. Good alternative when Snake River crowds are heavy.',
'Wyoming fishing license required. Gros Ventre Wilderness — bear spray recommended. Grand Teton National Park regulations apply in park sections.'),

-- CLARKS FORK YELLOWSTONE
((SELECT id FROM rivers WHERE slug = 'clarks-fork-yellowstone'),
'The Clarks Fork of the Yellowstone is Wyoming''s only Wild and Scenic River — a spectacular freestone stream cutting through dramatic canyon country near Cody and Cooke City. Less famous than neighboring Yellowstone Park waters but exceptional wild fishing for cutthroat and brown trout in some of the most dramatic scenery in Wyoming.',
'Freestone. Wyoming''s only Wild and Scenic River. Wild cutthroat and brown trout. Dramatic canyon character. Remote sections with limited access. Connects to Montana near Billings.',
'[
  {"name": "Canyon Section (Wyoming)", "description": "Wild and Scenic designated water. Spectacular canyon walls. Difficult access but exceptional fishing. Native cutthroat in pristine condition."},
  {"name": "Upper Section (near Cooke City)", "description": "Mountain character near Yellowstone Park boundary. Cold clear water. Wild cutthroat. Good access near highway."}
]',
'[
  {"month": "June", "notes": "Post-runoff. River clearing. Cutthroat active. Some of the best early season fishing."},
  {"month": "July", "notes": "Prime summer fishing. Attractor dries and hoppers. Spectacular scenery."},
  {"month": "August", "notes": "Excellent summer fishing. Hoppers along canyon walls."},
  {"month": "September", "notes": "Excellent fall fishing. Brown trout active. Less pressure."},
  {"month": "October", "notes": "Fall brown trout. Streamers and large nymphs in canyon pools."}
]',
'Remote canyon access rewards anglers willing to hike in. Attractor dry flies most effective. Wild and Scenic designation protects the river character. One of the most scenic fishing experiences in Wyoming — plan a full day. Connects with Montana river system near Belfry.',
'Wyoming fishing license required. Wild and Scenic River — no motorized vehicles in canyon section. Check Wyoming Game and Fish for current regulations.')

ON CONFLICT (river_id) DO UPDATE SET
  about = EXCLUDED.about,
  character = EXCLUDED.character,
  best_sections = EXCLUDED.best_sections,
  best_months = EXCLUDED.best_months,
  techniques = EXCLUDED.techniques,
  regulations_notes = EXCLUDED.regulations_notes,
  updated_at = now();
