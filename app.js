        // Import Firebase SDK Modules
        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, addDoc, getDocs, onSnapshot, query, where, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

        // User's provided Firebase Configuration
        const firebaseConfig = {
            apiKey: "AIzaSyDUiQlSLxWKx1jO0EpIy0n1RubANLI_ScY",
            authDomain: "web-application-developm-60be2.firebaseapp.com",
            projectId: "web-application-developm-60be2",
            storageBucket: "web-application-developm-60be2.firebasestorage.app",
            messagingSenderId: "174592285953",
            appId: "1:174592285953:web:f6930d9e244185ef784f00",
            measurementId: "G-H73T19QTVH"
        };

        // Initialize Firebase
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);

        // Core App State Variables
        let currentUser = null;
        let currentUserId = null;
        let activeLocationId = null;
        let activeLocationName = "";
        let locationsCache = [];
        let activeTab = "home";

        // Dynamic Firebase Path helper to comply with environment Rule 1
        const getArtifactPath = (collectionName) => {
            const appId = "default-app-id";
            return `artifacts/${appId}/users/${currentUserId}/${collectionName}`;
        };

        // Check Auth State Change
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                currentUser = user;
                currentUserId = user.uid;
                
                // Set initials on Sidebar
                const userName = user.displayName || "Operator";
                document.getElementById("sidebarUserName").innerText = userName;
                document.getElementById("mobileUserName").innerText = userName;
                
                const initials = userName.split(" ").map(n => n[0]).join("").substring(0,2).toUpperCase();
                document.getElementById("sidebarUserInitials").innerText = initials;

                // Sync basic metadata from user profile doc
                const userDocRef = doc(db, `users/${currentUserId}`);
                try {
                    const userSnap = await getDoc(userDocRef);
                    if (userSnap.exists()) {
                        const userData = userSnap.data();
                        document.getElementById("sidebarUserCompany").innerText = userData.company || "Store Owner";
                    }
                } catch (e) {
                    console.log("Profile sync complete without custom properties.");
                }

                // Hydrate Store Locations
                await loadStoreLocations();
                hideLoading();
                showDashboard();
            } else {
                currentUser = null;
                currentUserId = null;
                hideLoading();
                showLogin();
            }
        });

        async function loadStoreLocations() {
            showLoading("Verifying Locations...", "Fetching active branches from database.");
            const locCollectionPath = getArtifactPath("locations");
            
            try {
                const querySnapshot = await getDocs(collection(db, locCollectionPath));
                locationsCache = [];
                querySnapshot.forEach((doc) => {
                    locationsCache.push({ id: doc.id, ...doc.data() });
                });

                if (locationsCache.length === 0) {
                    // Seed a default location if brand new registration
                    const defaultLocRef = await addDoc(collection(db, locCollectionPath), {
                        name: "Main Downtown Diner",
                        createdAt: new Date().toISOString()
                    });
                    activeLocationId = defaultLocRef.id;
                    activeLocationName = "Main Downtown Diner";
                    locationsCache.push({ id: activeLocationId, name: activeLocationName });
                    
                    // Seed dummy checklists, PM, templates for immediate high fidelity testing
                    await seedInitialOperationalTemplates(activeLocationId);
                } else {
                    activeLocationId = locationsCache[0].id;
                    activeLocationName = locationsCache[0].name;
                }

                populateLocationDropdowns();
                initRealtimeDashboardListeners(); // Register reactive streams
            } catch (error) {
                console.error("Failed to load locations: ", error);
                showToast("Connection Error", "Check your Firestore rules or credentials configuration.", "error");
            }
        }

        // Seeding operational components so the database looks beautiful on signup
        async function seedInitialOperationalTemplates(locationId) {
            // Seed 1: Default Checklist Tasks
            const checklistPath = getArtifactPath("checklists");
            const initialChecklists = [
                { title: "Verify line refrigeration units measure under 40°F", category: "opening", role: "Kitchen Manager", completed: false, locationId: locationId },
                { title: "Calibrate electronic meat thermometers using water-ice method", category: "opening", role: "Head Cook", completed: false, locationId: locationId },
                { title: "Check inventory levels and sanitize cutting surfaces", category: "opening", role: "Commis Cook", completed: false, locationId: locationId },
                { title: "Sanitize beverage dispenser nozzles & ice trays", category: "cleaning", role: "FOH Server", completed: false, locationId: locationId },
                { title: "Sweep & deep clean main kitchen walking corridors", category: "cleaning", role: "Porter", completed: false, locationId: locationId },
                { title: "Secure hood exhaust systems & empty grease traps", category: "cleaning", role: "Closing Lead", completed: false, locationId: locationId }
            ];
            for (const item of initialChecklists) {
                await addDoc(collection(db, checklistPath), item);
            }

            // Seed 2: Default Preventive Maintenance Task
            const pmPath = getArtifactPath("preventiveMaintenance");
            const initialPMs = [
                { title: "Clean & Sanitize Walk-in Ice Machine", asset: "Manitowoc Ice System", frequency: "Monthly", status: "Pending", lastCompleted: "Never", locationId: locationId },
                { title: "Replace exhaust fan belt and grease bearings", asset: "Hood Exhaust Unit", frequency: "Quarterly", status: "Pending", lastCompleted: "Never", locationId: locationId },
                { title: "Snake prep kitchen sinks & clean grease trap lines", asset: "Central Drainage Trap", frequency: "Weekly", status: "Pending", lastCompleted: "Never", locationId: locationId }
            ];
            for (const pm of initialPMs) {
                await addDoc(collection(db, pmPath), pm);
            }

            // Seed 3: Default Work Order
            const woPath = getArtifactPath("workOrders");
            await addDoc(collection(db, woPath), {
                title: "Prep Table Refrigeration - Coolant Top Up",
                priority: "High",
                vendor: "Aircon Specialists LLC",
                description: "Holding temp around 44°F, needs prompt inspection and recharge of R404A coolant.",
                status: "Open",
                createdAt: new Date().toISOString(),
                locationId: locationId
            });

            // Seed 4: Compliance Docs
            const docPath = getArtifactPath("complianceDocs");
            const initialDocs = [
                { owner: "Sarah Jenkins (Lead Chef)", type: "Employee Food Card", expiry: "2026-10-15", status: "Active", locationId: locationId },
                { owner: "Downtown Diner LLC", type: "Health Permit", expiry: "2026-12-31", status: "Active", locationId: locationId },
                { owner: "Marcus Rodriguez (Sous)", type: "Employee Food Card", expiry: "2026-08-01", status: "Active", locationId: locationId }
            ];
            for (const cDoc of initialDocs) {
                await addDoc(collection(db, docPath), cDoc);
            }
        }

        function populateLocationDropdowns() {
            const dest = document.getElementById("locationSelector");
            const mobDest = document.getElementById("mobileLocationSelector");
            dest.innerHTML = "";
            mobDest.innerHTML = "";

            locationsCache.forEach(loc => {
                const opt1 = `<option value="${loc.id}">${loc.name}</option>`;
                const opt2 = `<option value="${loc.id}">${loc.name}</option>`;
                dest.insertAdjacentHTML('beforeend', opt1);
                mobDest.insertAdjacentHTML('beforeend', opt2);
            });

            dest.value = activeLocationId;
            mobDest.value = activeLocationId;
        }

        let unsubscribers = [];
        function initRealtimeDashboardListeners() {
            // Unsubscribe existing listeners to prevent leaks
            unsubscribers.forEach(unsub => unsub());
            unsubscribers = [];

            if (!activeLocationId || !currentUserId) return;

            showLoading("Syncing Live Stream...", "Fetching latest logs.");

            // 1. Listen for Checklists
            const qChecklists = query(collection(db, getArtifactPath("checklists")), where("locationId", "==", activeLocationId));
            const unsubCheck = onSnapshot(qChecklists, (snapshot) => {
                const lists = [];
                snapshot.forEach(doc => lists.push({ id: doc.id, ...doc.data() }));
                renderChecklists(lists);
                calculateComplianceScore(lists);
            }, (error) => {
                console.error("Checklist error: ", error);
            });
            unsubscribers.push(unsubCheck);

            // 2. Listen for Temperature Logs (Logged today)
            const qTemps = query(collection(db, getArtifactPath("tempLogs")), where("locationId", "==", activeLocationId));
            const unsubTemps = onSnapshot(qTemps, (snapshot) => {
                const temps = [];
                snapshot.forEach(doc => temps.push({ id: doc.id, ...doc.data() }));
                renderTempLogs(temps);
            }, (error) => {
                console.error("Temp log sync error: ", error);
            });
            unsubscribers.push(unsubTemps);

            // 3. Listen for Preventive Maintenance Task Rules
            const qPM = query(collection(db, getArtifactPath("preventiveMaintenance")), where("locationId", "==", activeLocationId));
            const unsubPM = onSnapshot(qPM, (snapshot) => {
                const pms = [];
                snapshot.forEach(doc => pms.push({ id: doc.id, ...doc.data() }));
                renderPMTasks(pms);
                renderQrStickers(pms); // Render visual barcode tags based on active equipment
            }, (error) => {
                console.error("PM sync error: ", error);
            });
            unsubscribers.push(unsubPM);

            // 4. Listen for Repair Work Orders
            const qWO = query(collection(db, getArtifactPath("workOrders")), where("locationId", "==", activeLocationId));
            const unsubWO = onSnapshot(qWO, (snapshot) => {
                const wos = [];
                snapshot.forEach(doc => wos.push({ id: doc.id, ...doc.data() }));
                renderWorkOrders(wos);
            }, (error) => {
                console.error("Work Order sync error: ", error);
            });
            unsubscribers.push(unsubWO);

            // 5. Listen for Regulatory Documents
            const qDocs = query(collection(db, getArtifactPath("complianceDocs")), where("locationId", "==", activeLocationId));
            const unsubDocs = onSnapshot(qDocs, (snapshot) => {
                const docRecords = [];
                snapshot.forEach(doc => docRecords.push({ id: doc.id, ...doc.data() }));
                renderComplianceDocs(docRecords);
            }, (error) => {
                console.error("Docs sync error: ", error);
            });
            unsubscribers.push(unsubDocs);

            hideLoading();
        }

        function calculateComplianceScore(checklists) {
            if (!checklists || checklists.length === 0) {
                updateComplianceMeter(100, 0, 0, 0, 0, 0);
                return;
            }

            const total = checklists.length;
            const completed = checklists.filter(item => item.completed).length;
            const checkPercent = Math.round((completed / total) * 100);

            // Fetch metrics count from DOM states
            const pendingPM = parseInt(document.getElementById("metricPM").innerText) || 0;
            const pmCompleted = pendingPM === 0 ? 100 : Math.max(30, 100 - (pendingPM * 20));

            // Composite Compliance score (70% checklist adherence, 30% mechanical preventive maintenance weight)
            const scoreIndex = Math.round((checkPercent * 0.7) + (pmCompleted * 0.3));

            updateComplianceMeter(scoreIndex, checkPercent, total, completed, pmCompleted, pendingPM);
        }

        function updateComplianceMeter(score, checkPercent, totalCheck, completedCheck, pmPercent, pendingPM) {
            document.getElementById("complianceScorePercent").innerText = `${score}%`;
            
            // Adjust SVG stroke-dashoffset: Circumference of 54 radius = 339.29
            const circle = document.getElementById("radialProgressCircle");
            const circumference = 339.29;
            const offset = circumference - (score / 100) * circumference;
            circle.style.strokeDashoffset = offset;

            // Update detailed stats
            document.getElementById("checklistProgressText").innerText = `${checkPercent}%`;
            document.getElementById("checklistProgressBar").style.width = `${checkPercent}%`;

            document.getElementById("pmProgressText").innerText = `${pmPercent}%`;
            document.getElementById("pmProgressBar").style.width = `${pmPercent}%`;

            // Adjust colors of compliance index
            if (score > 85) {
                circle.className.baseVal = "text-primary-500 transition-all duration-500";
            } else if (score > 60) {
                circle.className.baseVal = "text-amber-500 transition-all duration-500";
            } else {
                circle.className.baseVal = "text-rose-500 transition-all duration-500";
            }
        }

        function renderChecklists(lists) {
            const containerOpening = document.getElementById("checklistOpeningContainer");
            const containerCleaning = document.getElementById("checklistCleaningContainer");

            containerOpening.innerHTML = "";
            containerCleaning.innerHTML = "";

            let openingTotal = 0;
            let openingDone = 0;
            let cleaningTotal = 0;
            let cleaningDone = 0;

            lists.forEach((item) => {
                const element = `
                    <div class="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg transition-colors group">
                        <div class="flex items-center gap-3">
                            <input type="checkbox" id="check-${item.id}" ${item.completed ? 'checked' : ''} 
                                   onchange="toggleChecklistItem('${item.id}', this.checked)" 
                                   class="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer" />
                            <label for="check-${item.id}" class="text-xs ${item.completed ? 'line-through text-slate-400 font-normal' : 'text-slate-700 font-semibold'} cursor-pointer">
                                ${item.title}
                            </label>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-medium">${item.role}</span>
                            <button onclick="deleteChecklistItem('${item.id}')" class="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 p-1 rounded transition-all text-xs">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;

                if (item.category === "opening") {
                    openingTotal++;
                    if (item.completed) openingDone++;
                    containerOpening.insertAdjacentHTML('beforeend', element);
                } else {
                    cleaningTotal++;
                    if (item.completed) cleaningDone++;
                    containerCleaning.insertAdjacentHTML('beforeend', element);
                }
            });

            // If empty states
            if (openingTotal === 0) containerOpening.innerHTML = `<p class="p-4 text-xs text-slate-400 text-center">No opening tasks active.</p>`;
            if (cleaningTotal === 0) containerCleaning.innerHTML = `<p class="p-4 text-xs text-slate-400 text-center">No cleaning tasks active.</p>`;

            // Update Counts
            document.getElementById("openingProgressCount").innerText = `${openingDone}/${openingTotal}`;
            document.getElementById("cleaningProgressCount").innerText = `${cleaningDone}/${cleaningTotal}`;
            
            const total = openingTotal + cleaningTotal;
            const completed = openingDone + cleaningDone;
            document.getElementById("metricChecklists").innerText = `${completed}/${total}`;
            
            document.getElementById("checklistSummaryTotal").innerText = `${total} Tasks`;
            document.getElementById("checklistSummaryCompleted").innerText = `${completed} Done`;
            document.getElementById("checklistSummaryRemaining").innerText = `${total - completed} Pending`;
        }

        // Toggle state in Firestore
        window.toggleChecklistItem = async function(id, isCompleted) {
            try {
                const docRef = doc(db, getArtifactPath("checklists"), id);
                await updateDoc(docRef, { completed: isCompleted });
                showToast("Task Updated", "Shift operational progress logged.", "success");
            } catch (error) {
                console.error("Failed to toggle task checklist item", error);
                showToast("Update Failed", "Task progress could not be committed.", "error");
            }
        };

        // Delete from Firestore
        window.deleteChecklistItem = async function(id) {
            try {
                const docRef = doc(db, getArtifactPath("checklists"), id);
                await deleteDoc(docRef);
                showToast("Task Deleted", "Removed checklist item from template.", "success");
            } catch (error) {
                console.error(error);
            }
        };

        // Reset checklist completed logs
        window.resetChecklistData = async function() {
            showLoading("Resetting...", "Flushing completion indicators for new shift.");
            const q = query(collection(db, getArtifactPath("checklists")), where("locationId", "==", activeLocationId));
            try {
                const snap = await getDocs(q);
                const promises = [];
                snap.forEach(documentObj => {
                    const docRef = doc(db, getArtifactPath("checklists"), documentObj.id);
                    promises.push(updateDoc(docRef, { completed: false }));
                });
                await Promise.all(promises);
                hideLoading();
                showToast("Shift Checklist Cleared", "Ready for next operations period.", "info");
            } catch (error) {
                hideLoading();
                console.error(error);
            }
        };

        function renderTempLogs(logs) {
            const tableBody = document.getElementById("tempLogsTableBody");
            tableBody.innerHTML = "";

            let warningEntries = 0;
            logs.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));

            logs.forEach(log => {
                const isUnsafe = checkIsTemperatureUnsafe(log.equipmentName, parseFloat(log.temperature));
                if (isUnsafe) warningEntries++;

                const statusLabel = isUnsafe 
                    ? `<span class="bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full font-bold">CRITICAL OUT OF BOUNDS</span>`
                    : `<span class="bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full font-bold">SECURED</span>`;

                const row = `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="p-4 font-semibold text-slate-800">${new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                        <td class="p-4 font-semibold text-slate-900">${log.equipmentName}</td>
                        <td class="p-4 font-bold ${isUnsafe ? 'text-rose-600' : 'text-teal-600'}">${log.temperature}°F</td>
                        <td class="p-4">${statusLabel}</td>
                        <td class="p-4 font-semibold text-slate-500">${log.logger || 'OP'}</td>
                    </tr>
                `;
                tableBody.insertAdjacentHTML('beforeend', row);
            });

            if (logs.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400">No shift temperature checks filed yet today.</td></tr>`;
            }

            document.getElementById("metricTemps").innerText = `${logs.length} logged`;
            const warningEl = document.getElementById("metricTempsWarning");
            
            if (warningEntries > 0) {
                warningEl.innerHTML = `<span class="text-rose-600 font-bold"><i class="fa-solid fa-triangle-exclamation"></i> ${warningEntries} unsafe log entries</span>`;
            } else {
                warningEl.innerText = "All lines secured";
            }
        }

        function checkIsTemperatureUnsafe(equipName, temp) {
            if (equipName.includes("Chiller") || equipName.includes("Cooler")) {
                return (temp < 33 || temp > 40);
            }
            if (equipName.includes("Freezer")) {
                return (temp < -10 || temp > 0);
            }
            if (equipName.includes("Hot Holding")) {
                return (temp < 135);
            }
            if (equipName.includes("Cooking")) {
                return (temp < 165);
            }
            return false;
        }

        function renderPMTasks(tasks) {
            const grid = document.getElementById("pmTasksGrid");
            grid.innerHTML = "";
            let overdueCount = 0;

            tasks.forEach(task => {
                const isOverdue = task.status === "Pending";
                if (isOverdue) overdueCount++;

                const statusBadge = isOverdue
                    ? `<span class="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">Overdue Tasks</span>`
                    : `<span class="bg-teal-100 text-teal-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">Complete</span>`;

                const card = `
                    <div class="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex flex-col justify-between space-y-4">
                        <div class="space-y-1.5">
                            <div class="flex justify-between items-start">
                                <span class="text-[10px] text-primary-600 font-bold tracking-wider uppercase">${task.frequency} Cycle</span>
                                ${statusBadge}
                            </div>
                            <h4 class="font-bold text-slate-900 text-sm leading-tight">${task.title}</h4>
                            <p class="text-xs text-slate-500 flex items-center gap-1">
                                <i class="fa-solid fa-kitchen-set"></i> Equipment: ${task.asset}
                            </p>
                        </div>
                        <div class="pt-3 border-t border-slate-100 flex items-center justify-between">
                            <span class="text-[10px] text-slate-400">Last Completed: <strong class="text-slate-600 font-semibold">${task.lastCompleted}</strong></span>
                            ${isOverdue ? `
                                <button onclick="completePMTask('${task.id}')" class="bg-slate-950 hover:bg-slate-900 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-all">
                                    Complete <i class="fa-solid fa-check ml-0.5"></i>
                                </button>
                            ` : `
                                <span class="text-emerald-600 text-xs font-bold"><i class="fa-solid fa-circle-check"></i> Secured</span>
                            `}
                        </div>
                    </div>
                `;
                grid.insertAdjacentHTML('beforeend', card);
            });

            if (tasks.length === 0) {
                grid.innerHTML = `<div class="col-span-full py-8 text-center text-slate-400">No scheduled preventive maintenance profiles configured.</div>`;
            }

            document.getElementById("metricPM").innerText = overdueCount;
        }

        window.completePMTask = async function(id) {
            try {
                const docRef = doc(db, getArtifactPath("preventiveMaintenance"), id);
                await updateDoc(docRef, {
                    status: "Secured",
                    lastCompleted: new Date().toLocaleDateString()
                });
                showToast("PM Logged", "Preventive maintenance cycle tracked.", "success");
            } catch (error) {
                console.error(error);
            }
        };

        function renderQrStickers(tasks) {
            const container = document.getElementById("qrAssetTagsGrid");
            if (!container) return;

            container.innerHTML = "";

            if (tasks.length === 0) {
                container.innerHTML = `<p class="col-span-full p-6 text-center text-slate-400">Create equipment in the Preventive Maintenance or temperature tab to generate QR sticker labels.</p>`;
                return;
            }

            tasks.forEach((task, index) => {
                const qrIdStr = `asset-qr-container-${index}`;
                const stickerHtml = `
                    <div class="bg-white rounded-xl border border-slate-300 p-4 shadow-sm flex flex-col items-center justify-between space-y-3 relative overflow-hidden bg-gradient-to-b from-white to-slate-50">
                        <div class="w-full text-center border-b border-dashed border-slate-200 pb-2">
                            <span class="text-[9px] font-extrabold text-primary-700 tracking-wider block uppercase">MaintainIQ Asset Sticker</span>
                            <h4 class="text-xs font-black text-slate-800 truncate">${task.asset}</h4>
                        </div>

                        <!-- Target elements for dynamically generated QR Codes -->
                        <div class="p-2 bg-white border border-slate-200 rounded-lg shadow-inner flex items-center justify-center">
                            <div id="${qrIdStr}" class="w-24 h-24"></div>
                        </div>

                        <div class="text-center w-full">
                            <span class="text-[9px] font-bold text-slate-400 uppercase font-mono block">TAG ID: M-00${index+1}</span>
                            <div class="mt-2 flex gap-1 justify-center">
                                <button onclick="printStickerElement('${task.asset}')" class="bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px] px-2.5 py-1 rounded transition-all">
                                    <i class="fa-solid fa-print"></i> Print sticker
                                </button>
                                <button onclick="simulateQRScan('${task.asset}')" class="bg-primary-100 hover:bg-primary-200 text-primary-800 font-bold text-[10px] px-2.5 py-1 rounded transition-all">
                                    <i class="fa-solid fa-expand"></i> Simulate scan
                                </button>
                            </div>
                        </div>
                    </div>
                `;

                container.insertAdjacentHTML('beforeend', stickerHtml);

                // Use the library helper to construct actual QR pixels representing the JSON identifier
                setTimeout(() => {
                    const qrElem = document.getElementById(qrIdStr);
                    if (qrElem) {
                        qrElem.innerHTML = "";
                        new QRCode(qrElem, {
                            text: JSON.stringify({ type: "asset", asset: task.asset }),
                            width: 96,
                            height: 96,
                            colorDark: "#0f172a",
                            colorLight: "#ffffff",
                            correctLevel: QRCode.CorrectLevel.H
                        });
                    }
                }, 100);
            });
        }

        // Live Print Command Simulator
        window.printStickerElement = function(assetName) {
            showToast("Sticker Dispatch", `Sent print instruction for: ${assetName} to your standard barcode sticker printer.`, "info");
        };

        let html5QrScanner = null;

        window.startCameraScanner = function() {
            document.getElementById("qr-scan-placeholder").classList.add("hidden");
            document.getElementById("btnStartQr").classList.add("hidden");
            document.getElementById("btnStopQr").classList.remove("hidden");

            html5QrScanner = new Html5Qrcode("qr-reader");
            const config = { fps: 15, qrbox: { width: 150, height: 150 } };

            html5QrScanner.start(
                { facingMode: "environment" },
                config,
                (decodedText) => {
                    // Successful scan callback
                    stopCameraScanner();
                    processQrPayload(decodedText);
                },
                (errorMessage) => {
                    // console.log("scanning stream searching...");
                }
            ).catch(err => {
                console.error("Camera startup failed: ", err);
                showToast("Camera Access Error", "Permissions rejected or device camera is currently unavailable. Use our Simulator sandbox on the left to verify this flow!", "error");
                stopCameraScanner();
            });
        };

        window.stopCameraScanner = function() {
            document.getElementById("qr-scan-placeholder").classList.remove("hidden");
            document.getElementById("btnStartQr").classList.remove("hidden");
            document.getElementById("btnStopQr").classList.add("hidden");

            if (html5QrScanner) {
                html5QrScanner.stop().then(() => {
                    html5QrScanner = null;
                }).catch(err => {
                    console.error("Failed to stop scanner cleanly.", err);
                });
            }
        };

        // Interpret QR Codes
        function processQrPayload(payloadStr) {
            try {
                const parsed = JSON.parse(payloadStr);
                if (parsed && parsed.type === "asset") {
                    triggerActionMenuForAsset(parsed.asset);
                } else {
                    showToast("Unsupported Label", "This QR tag is not registered in the MaintainIQ ecosystem.", "error");
                }
            } catch (e) {
                // If it is just plaintext asset, recover
                if (payloadStr && payloadStr.trim().length > 0) {
                    triggerActionMenuForAsset(payloadStr);
                } else {
                    showToast("Tag Error", "Invalid QR code read.", "error");
                }
            }
        }

        // Simulate scans from button actions
        window.simulateQRScan = function(assetName) {
            processQrPayload(JSON.stringify({ type: "asset", asset: assetName }));
        };

        window.triggerQRSimulation = function() {
            const val = document.getElementById("qrSimulationSelector").value;
            simulateQRScan(val);
        };

        // Modal triggers pre-filled with the scanned asset
        function triggerActionMenuForAsset(assetName) {
            document.getElementById("qrScannedDeviceName").innerText = assetName;
            
            // Re-route click logic
            document.getElementById("btnQrLogTemp").onclick = () => {
                closeModal('modalQrScanAction');
                switchTab('temps');
                
                // Pre-fill equipment selector in log form
                const select = document.getElementById("tempEquipment");
                let matched = false;
                for (let i = 0; i < select.options.length; i++) {
                    if (select.options[i].value.toLowerCase().includes(assetName.toLowerCase()) || 
                        assetName.toLowerCase().includes(select.options[i].value.toLowerCase())) {
                        select.selectedIndex = i;
                        matched = true;
                        break;
                    }
                }
                if (!matched) {
                    // Create an option dynamically if not present
                    const opt = document.createElement("option");
                    opt.value = assetName;
                    opt.innerText = assetName;
                    select.appendChild(opt);
                    select.value = assetName;
                }
                document.getElementById("tempDegrees").focus();
            };

            document.getElementById("btnQrCreateWO").onclick = () => {
                closeModal('modalQrScanAction');
                switchTab('repairs');
                openAddWorkOrderModal();
                
                // Pre-fill details
                document.getElementById("newWOTitle").value = `${assetName} - Issue identified from QR scan`;
                document.getElementById("newWODescription").value = `A field technician scanned the QR tag associated with this asset and noted...`;
            };

            document.getElementById("modalQrScanAction").classList.remove("hidden");
        }

        function renderWorkOrders(wos) {
            const container = document.getElementById("workOrdersContainer");
            container.innerHTML = "";

            let activeCount = 0;
            wos.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

            wos.forEach(wo => {
                const isActive = wo.status === "Open";
                if (isActive) activeCount++;

                const priorityBadge = wo.priority === "High" 
                    ? `<span class="bg-rose-50 text-rose-600 text-[10px] font-bold px-2 py-0.5 rounded">HIGH PRIORITY</span>`
                    : `<span class="bg-amber-50 text-amber-600 text-[10px] font-bold px-2 py-0.5 rounded">ROUTINE</span>`;

                const ticket = `
                    <div class="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-3 relative overflow-hidden">
                        <div class="flex items-start justify-between">
                            <div class="space-y-1">
                                <div class="flex items-center gap-2">
                                    ${priorityBadge}
                                    <span class="text-[10px] text-slate-400">Filed: ${new Date(wo.createdAt).toLocaleDateString()}</span>
                                </div>
                                <h4 class="font-extrabold text-slate-900 text-sm leading-tight">${wo.title}</h4>
                            </div>
                            <span class="text-xs ${isActive ? 'bg-amber-500/10 text-amber-700 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'} border px-2.5 py-1 rounded-full font-bold">
                                ${wo.status}
                            </span>
                        </div>
                        <p class="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">${wo.description}</p>
                        <div class="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                            <span class="text-slate-400">Assigned Tech: <strong class="text-slate-600 font-semibold">${wo.vendor}</strong></span>
                            ${isActive ? `
                                <button onclick="resolveWorkOrder('${wo.id}')" class="text-primary-600 hover:text-primary-700 font-bold flex items-center gap-1">
                                    <i class="fa-solid fa-square-check"></i> Close Ticket
                                </button>
                            ` : `
                                <span class="text-slate-400"><i class="fa-solid fa-circle-check text-emerald-500"></i> Repaired</span>
                            `}
                        </div>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', ticket);
            });

            if (wos.length === 0) {
                container.innerHTML = `<div class="py-12 bg-white rounded-2xl border text-center text-slate-400">No repair work orders opened currently.</div>`;
            }

            document.getElementById("metricWorkOrders").innerText = activeCount;
        }

        window.resolveWorkOrder = async function(id) {
            try {
                const docRef = doc(db, getArtifactPath("workOrders"), id);
                await updateDoc(docRef, { status: "Resolved" });
                showToast("Work Order Closed", "Repair marked as successfully completed.", "success");
            } catch (error) {
                console.error(error);
            }
        };

        function renderComplianceDocs(docs) {
            const tbody = document.getElementById("complianceTableBody");
            tbody.innerHTML = "";

            docs.forEach(doc => {
                const expiryDate = new Date(doc.expiry);
                const today = new Date();
                const diffTime = expiryDate - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                let statusLabel = `<span class="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full text-[10px]">ACTIVE</span>`;
                if (diffDays < 0) {
                    statusLabel = `<span class="bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full text-[10px]">EXPIRED</span>`;
                } else if (diffDays <= 30) {
                    statusLabel = `<span class="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full text-[10px]">RENEW SOON (${diffDays}d)</span>`;
                }

                const row = `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="p-4 font-semibold text-slate-900">${doc.owner}</td>
                        <td class="p-4 text-slate-600 font-medium">${doc.type}</td>
                        <td class="p-4 font-mono font-bold text-slate-700">${doc.expiry}</td>
                        <td class="p-4">${statusLabel}</td>
                        <td class="p-4 text-right">
                            <button onclick="deleteDocItem('${doc.id}')" class="text-xs text-slate-400 hover:text-rose-500 font-semibold transition-colors">
                                <i class="fa-solid fa-trash-can mr-1"></i> Remove
                            </button>
                        </td>
                    </tr>
                `;
                tbody.insertAdjacentHTML('beforeend', row);
            });

            if (docs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400">No regulatory certifications recorded.</td></tr>`;
            }
        }

        window.deleteDocItem = async function(id) {
            try {
                const docRef = doc(db, getArtifactPath("complianceDocs"), id);
                await deleteDoc(docRef);
                showToast("Document Deleted", "Certification index removed.", "success");
            } catch (error) {
                console.error(error);
            }
        };

        window.toggleAuthView = function(view) {
            document.getElementById("loginView").classList.add("hidden");
            document.getElementById("registerView").classList.add("hidden");
            document.getElementById("dashboardWorkspace").classList.add("hidden");

            if (view === "login") {
                document.getElementById("loginView").classList.remove("hidden");
            } else if (view === "register") {
                document.getElementById("registerView").classList.remove("hidden");
            }
        };

        function showDashboard() {
            document.getElementById("loginView").classList.add("hidden");
            document.getElementById("registerView").classList.add("hidden");
            document.getElementById("dashboardWorkspace").classList.remove("hidden");
            switchTab("home");
        }

        function showLogin() {
            document.getElementById("loginView").classList.remove("hidden");
            document.getElementById("registerView").classList.add("hidden");
            document.getElementById("dashboardWorkspace").classList.add("hidden");
        }

        window.switchTab = function(tabId) {
            activeTab = tabId;
            
            // Clean scan instances if switching away
            if (tabId !== "qr") {
                stopCameraScanner();
            }

            // Hide all panes
            const panes = document.querySelectorAll(".tab-pane");
            panes.forEach(pane => pane.classList.add("hidden"));

            // Show active pane
            document.getElementById(`tab-${tabId}`).classList.remove("hidden");

            // Style Sidebar Tabs
            const tabs = document.querySelectorAll(".sidebar-tab");
            tabs.forEach(tab => {
                tab.classList.remove("bg-slate-800", "text-white", "border-l-4", "border-primary-500", "pl-3");
                tab.classList.add("text-slate-300");
            });

            const activeTabButton = document.getElementById(`nav-${tabId}`);
            if (activeTabButton) {
                activeTabButton.classList.add("bg-slate-800", "text-white", "border-l-4", "border-primary-500", "pl-3");
                activeTabButton.classList.remove("text-slate-300");
            }

            // Update Header title
            const titles = {
                'home': 'Dashboard Home',
                'qr': 'QR Code Asset Management',
                'checklists': 'Digital Operations Checklists',
                'temps': 'Food Safety Temperature Log',
                'pm': 'Preventive Maintenance Records',
                'repairs': 'Mechanical Repair Tickets (CMMS)',
                'compliance': 'Regulatory Permits & Food Cards'
            };
            document.getElementById("workspaceTitle").innerText = titles[tabId] || 'Dashboard';
            
            // Close mobile menu if open
            document.getElementById("mobileSidebar").classList.add("hidden");
        };

        window.toggleMobileSidebar = function() {
            const sb = document.getElementById("mobileSidebar");
            sb.classList.toggle("hidden");
        };

        window.handleLocationChange = function() {
            const selector = document.getElementById("locationSelector");
            const mobileSelector = document.getElementById("mobileLocationSelector");
            
            const selectedVal = selector.value || mobileSelector.value;
            if (!selectedVal) return;

            activeLocationId = selectedVal;
            selector.value = selectedVal;
            mobileSelector.value = selectedVal;

            const selectedObj = locationsCache.find(l => l.id === activeLocationId);
            activeLocationName = selectedObj ? selectedObj.name : "Location";

            showToast("Location Changed", `Switched active site: ${activeLocationName}`, "info");
            initRealtimeDashboardListeners(); // reload onSnapshot queries with activeLocationId filters
        };

        // Login Submission
        document.getElementById("formLogin").addEventListener("submit", async (e) => {
            e.preventDefault();
            const identifier = document.getElementById("loginMobile").value.trim();
            const password = document.getElementById("loginPassword").value;

            showLoading("Logging In...", "Validating credentials and authentication profile.");
            
            let email = identifier;
            if (!identifier.includes("@")) {
                const phoneClean = identifier.replace(/[^0-9]/g, "");
                if (phoneClean.length < 7) {
                    showToast("Invalid Input", "Please enter a valid email or mobile number.", "error");
                    hideLoading();
                    return;
                }
                email = `${phoneClean}@maintainiq-app.com`;
            }

            try {
                await signInWithEmailAndPassword(auth, email, password);
                showToast("Welcome Back!", "Operations successfully initiated.", "success");
            } catch (error) {
                hideLoading();
                console.error(error);
                let msg = "Incorrect username/email or password.";
                if (error.code === "auth/user-not-found") msg = "No operator account matching this identity exists.";
                showToast("Auth Failed", msg, "error");
            }
        });

        // Register Account Submission
        document.getElementById("formRegister").addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = document.getElementById("regName").value.trim();
            const email = document.getElementById("regEmail").value.trim().toLowerCase();
            const confirmEmail = document.getElementById("regConfirmEmail").value.trim().toLowerCase();
            const mobile = document.getElementById("regMobile").value.trim();
            const password = document.getElementById("regPassword").value;
            const confirmPassword = document.getElementById("regConfirmPassword").value;

            if (email !== confirmEmail) {
                showToast("Email Mismatch", "The email addresses entered do not match.", "error");
                return;
            }
            if (password.length < 6) {
                showToast("Weak Password", "Security demands passwords have at least 6 characters.", "error");
                return;
            }
            if (password !== confirmPassword) {
                showToast("Pass Mismatch", "Passwords do not match.", "error");
                return;
            }

            const phoneClean = mobile.replace(/[^0-9]/g, "");
            showLoading("Provisioning Space...", "Registering organization and seeding templates.");

            try {
                // Create Firebase Auth Credential using user's actual Email
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const userObj = userCredential.user;

                // Set profile display name
                userObj.displayName = name;

                // Provision Custom Company Profile Document in Firestore
                const userDocRef = doc(db, `users/${userObj.uid}`);
                await setDoc(userDocRef, {
                    name: name,
                    email: email,
                    company: "Gourmet Kitchens",
                    mobile: phoneClean,
                    createdAt: new Date().toISOString()
                });

                // Populate first active location to firestore collection
                const locCollectionPath = getArtifactPath("locations");
                const defaultLocRef = await addDoc(collection(db, locCollectionPath), {
                    name: "Main Restaurant Branch",
                    createdAt: new Date().toISOString()
                });

                activeLocationId = defaultLocRef.id;
                activeLocationName = "Main Restaurant Branch";

                // Concierge Seeding
                await seedInitialOperationalTemplates(activeLocationId);

                showToast("Trial Initiated", "Checklists automatically mapped for your location.", "success");
            } catch (error) {
                hideLoading();
                console.error(error);
                let msg = "Could not register details.";
                if (error.code === "auth/email-already-in-use") msg = "This email address is already linked to an account.";
                showToast("Registration Error", msg, "error");
            }
        });

        // Log Temperature Entry Submission
        document.getElementById("formAddTempLog").addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!activeLocationId) return;

            const equip = document.getElementById("tempEquipment").value;
            const val = document.getElementById("tempDegrees").value;
            const notes = document.getElementById("tempNotes").value.trim();

            const parsedVal = parseFloat(val);
            const isUnsafe = checkIsTemperatureUnsafe(equip, parsedVal);

            const tempPath = getArtifactPath("tempLogs");
            
            try {
                await addDoc(collection(db, tempPath), {
                    equipmentName: equip,
                    temperature: parsedVal,
                    notes: notes,
                    timestamp: new Date().toISOString(),
                    logger: auth.currentUser?.displayName || "Operator",
                    locationId: activeLocationId
                });

                document.getElementById("formAddTempLog").reset();
                
                if (isUnsafe) {
                    showToast("CRITICAL TEMPERATURE ALERT", `${equip} temperature logged outside of food safety bounds (${parsedVal}°F). Action Required!`, "error");
                } else {
                    showToast("Entry Logged", "Temperature entry secured.", "success");
                }
            } catch (error) {
                console.error(error);
            }
        });

        // Add Custom Location
        document.getElementById("formAddLocation").addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = document.getElementById("newLocName").value.trim();
            const locCollectionPath = getArtifactPath("locations");

            try {
                const docRef = await addDoc(collection(db, locCollectionPath), {
                    name: name,
                    createdAt: new Date().toISOString()
                });
                closeModal('modalAddLocation');
                document.getElementById("formAddLocation").reset();
                showToast("Location Added", `Created site profile for ${name}`, "success");
                
                // Set active and refresh
                activeLocationId = docRef.id;
                activeLocationName = name;
                await loadStoreLocations();
            } catch (error) {
                console.error(error);
            }
        });

        // Add Custom Checklist Item
        document.getElementById("formAddChecklist").addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!activeLocationId) return;

            const category = document.getElementById("newChecklistCategory").value;
            const title = document.getElementById("newChecklistTitle").value.trim();
            const role = document.getElementById("newChecklistRole").value.trim();

            const checklistPath = getArtifactPath("checklists");
            try {
                await addDoc(collection(db, checklistPath), {
                    title: title,
                    category: category,
                    role: role,
                    completed: false,
                    locationId: activeLocationId
                });
                closeModal('modalAddChecklist');
                document.getElementById("formAddChecklist").reset();
                showToast("Task Created", "Item appended to shift templates.", "success");
            } catch (error) {
                console.error(error);
            }
        });

        // Schedule Preventive Maintenance
        document.getElementById("formAddPM").addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!activeLocationId) return;

            const title = document.getElementById("newPMTitle").value.trim();
            const freq = document.getElementById("newPMFrequency").value;
            const asset = document.getElementById("newPMAsset").value.trim();

            const pmPath = getArtifactPath("preventiveMaintenance");
            try {
                await addDoc(collection(db, pmPath), {
                    title: title,
                    frequency: freq,
                    asset: asset,
                    status: "Pending",
                    lastCompleted: "Never",
                    locationId: activeLocationId
                });
                closeModal('modalAddPM');
                document.getElementById("formAddPM").reset();
                showToast("Schedule Saved", "Maintenance reminders compiled.", "success");
            } catch (error) {
                console.error(error);
            }
        });

        // File Work Order
        document.getElementById("formAddWorkOrder").addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!activeLocationId) return;

            const title = document.getElementById("newWOTitle").value.trim();
            const priority = document.getElementById("newWOPriority").value;
            const vendor = document.getElementById("newWOVendor").value.trim();
            const desc = document.getElementById("newWODescription").value.trim();

            const woPath = getArtifactPath("workOrders");
            try {
                await addDoc(collection(db, woPath), {
                    title: title,
                    priority: priority,
                    vendor: vendor,
                    description: desc,
                    status: "Open",
                    createdAt: new Date().toISOString(),
                    locationId: activeLocationId
                });
                closeModal('modalAddWorkOrder');
                document.getElementById("formAddWorkOrder").reset();
                showToast("Work Order Filed", "Mechanical dispatch logged.", "success");
            } catch (error) {
                console.error(error);
            }
        });

        // File Regulatory Doc
        document.getElementById("formAddDoc").addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!activeLocationId) return;

            const owner = document.getElementById("newDocOwner").value.trim();
            const type = document.getElementById("newDocType").value;
            const expiry = document.getElementById("newDocExpiry").value;

            const docPath = getArtifactPath("complianceDocs");
            try {
                await addDoc(collection(db, docPath), {
                    owner: owner,
                    type: type,
                    expiry: expiry,
                    status: "Active",
                    locationId: activeLocationId
                });
                closeModal('modalAddDoc');
                document.getElementById("formAddDoc").reset();
                showToast("Permit Tracked", "Renewal schedule cataloged.", "success");
            } catch (error) {
                console.error(error);
            }
        });

        // Logout Execution
        window.handleLogout = function() {
            showLoading("Logging Out...", "Terminating shift authentication state.");
            signOut(auth).then(() => {
                showToast("Goodbye", "Logged out from system safely.", "info");
            }).catch(err => {
                hideLoading();
                console.error(err);
            });
        };

        // Forgot password simulation
        window.showForgotPassword = function() {
            showToast("Password Recovery", "Please contact your group administrator to reset your registered device pincode/password.", "info");
        };

        // Modals Toggle logic
        window.openAddLocationModal = () => document.getElementById("modalAddLocation").classList.remove("hidden");
        window.openAddChecklistModal = () => document.getElementById("modalAddChecklist").classList.remove("hidden");
        window.openAddPMModal = () => document.getElementById("modalAddPM").classList.remove("hidden");
        window.openAddWorkOrderModal = () => document.getElementById("modalAddWorkOrder").classList.remove("hidden");
        window.openAddDocModal = () => document.getElementById("modalAddDoc").classList.remove("hidden");
        window.closeModal = (id) => document.getElementById(id).classList.add("hidden");

        // Toast notifications
        window.showToast = function(title, msg, type = "success") {
            const toast = document.getElementById("toastNotification");
            const icon = document.getElementById("toastIcon");
            const tContent = document.getElementById("toastContent");
            const tTitle = document.getElementById("toastTitle");
            const tMsg = document.getElementById("toastMessage");

            tTitle.innerText = title;
            tMsg.innerText = msg;

            // Type styles
            tContent.className = "flex items-start gap-3 p-4 bg-white border-l-4 rounded-r-xl shadow-xl ";
            if (type === "success") {
                tContent.classList.add("border-primary-500");
                icon.innerHTML = `<i class="fa-solid fa-circle-check text-primary-500"></i>`;
            } else if (type === "error") {
                tContent.classList.add("border-rose-500");
                icon.innerHTML = `<i class="fa-solid fa-circle-xmark text-rose-500 animate-bounce"></i>`;
            } else {
                tContent.classList.add("border-cyan-500");
                icon.innerHTML = `<i class="fa-solid fa-circle-info text-cyan-500"></i>`;
            }

            // Slide in
            toast.className = "fixed top-5 right-5 z-50 transform translate-y-0 opacity-100 transition-all duration-300 max-w-md w-full";
            
            // Auto hide
            setTimeout(() => {
                hideToast();
            }, 6000);
        };

        window.hideToast = function() {
            const toast = document.getElementById("toastNotification");
            toast.className = "fixed top-5 right-5 z-50 transform translate-y-[-120%] opacity-0 transition-all duration-300 max-w-md w-full";
        };

        // Loading overlay controls
        function showLoading(title = "Loading...", message = "Updating database records.") {
            document.getElementById("loadingTitle").innerText = title;
            document.getElementById("loadingMessage").innerText = message;
            document.getElementById("loadingOverlay").classList.remove("hidden", "opacity-0");
        }

        function hideLoading() {
            document.getElementById("loadingOverlay").classList.add("hidden", "opacity-0");
        }

        // On document ready
        window.onload = function() {
            document.getElementById("currentLocalDate").innerText = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        };