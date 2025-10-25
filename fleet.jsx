import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, query, onSnapshot, doc, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { Truck, Users, Settings, Fuel, BarChart3, X, PlusCircle, AlertCircle, Loader2, Wrench } from 'lucide-react';

// Global variables provided by the environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Helper to determine vehicle status dynamically
const getStatusBadge = (vehicle) => {
    if (vehicle.status === 'In Maintenance') {
        return <span className="px-2 py-1 text-xs font-semibold text-red-700 bg-red-100 rounded-full">Maintenance</span>;
    }
    if (vehicle.mileage >= vehicle.nextServiceMileage) {
        return <span className="px-2 py-1 text-xs font-semibold text-yellow-700 bg-yellow-100 rounded-full animate-pulse">Service Due</span>;
    }
    return <span className="px-2 py-1 text-xs font-semibold text-green-700 bg-green-100 rounded-full">Active</span>;
};

// --- Main App Component ---
const App = () => {
    const [db, setDb] = useState(null);
    const [userId, setUserId] = useState(null);
    const [vehicles, setVehicles] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newVehicle, setNewVehicle] = useState({
        make: '',
        model: '',
        year: '',
        vin: '',
        mileage: 0,
        nextServiceMileage: 5000,
        fuelType: 'Diesel',
        status: 'Active',
    });

    // 1. Firebase Initialization and Authentication
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const firestoreDb = getFirestore(app);
            const auth = getAuth(app);
            
            // Set up Auth Listener
            const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
                let currentUserId = user?.uid;
                
                if (!user) {
                    if (initialAuthToken) {
                        // Sign in with provided custom token
                        await signInWithCustomToken(auth, initialAuthToken);
                    } else {
                        // Fallback to anonymous sign-in if no token is available
                        currentUserId = crypto.randomUUID(); // Use a random ID for anonymous users
                        await signInAnonymously(auth);
                        currentUserId = auth.currentUser?.uid || currentUserId;
                    }
                }

                setDb(firestoreDb);
                setUserId(currentUserId);
            });

            return () => unsubscribeAuth();
        } catch (e) {
            console.error("Firebase initialization error:", e);
            setError("Failed to initialize the application. Check console for details.");
            setIsLoading(false);
        }
    }, []);


    // 2. Firestore Data Listener
    useEffect(() => {
        if (!db || !userId) return;

        setIsLoading(true);
        setError(null);

        // Path: /artifacts/{appId}/users/{userId}/vehicles
        const vehiclesRef = collection(db, `artifacts/${appId}/users/${userId}/vehicles`);
        const q = query(vehiclesRef);

        const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
            try {
                const fetchedVehicles = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                // Sort by status (Maintenance/Service Due first), then model
                fetchedVehicles.sort((a, b) => {
                    const statusA = (a.status === 'In Maintenance' || a.mileage >= a.nextServiceMileage) ? 0 : 1;
                    const statusB = (b.status === 'In Maintenance' || b.mileage >= b.nextServiceMileage) ? 0 : 1;
                    if (statusA !== statusB) return statusA - statusB;
                    return (a.model || '').localeCompare(b.model || '');
                });

                setVehicles(fetchedVehicles);
                setIsLoading(false);
            } catch (e) {
                console.error("Error fetching vehicles:", e);
                setError("Could not load fleet data.");
                setIsLoading(false);
            }
        }, (e) => {
            console.error("Firestore subscription error:", e);
            setError("Real-time connection failed.");
            setIsLoading(false);
        });

        return () => unsubscribeSnapshot();
    }, [db, userId]);

    // 3. Form Handlers and Data Seeding
    const handleInputChange = (e) => {
        const { name, value, type } = e.target;
        setNewVehicle(prev => ({
            ...prev,
            [name]: type === 'number' ? Number(value) : value
        }));
    };

    const handleAddVehicle = async (e) => {
        e.preventDefault();
        if (!db || !userId) {
            setError("Database connection not ready.");
            return;
        }

        // Basic validation
        if (!newVehicle.make || !newVehicle.model || !newVehicle.vin) {
            setError("Make, Model, and VIN are required.");
            return;
        }
        if (newVehicle.mileage > newVehicle.nextServiceMileage) {
             setError("Current Mileage cannot be higher than Next Service Mileage.");
            return;
        }

        try {
            const vehiclesRef = collection(db, `artifacts/${appId}/users/${userId}/vehicles`);

            await addDoc(vehiclesRef, {
                ...newVehicle,
                mileage: newVehicle.mileage, // Ensure number type
                nextServiceMileage: newVehicle.nextServiceMileage, // Ensure number type
                createdAt: serverTimestamp(),
            });

            // Reset form and close modal
            setNewVehicle({
                make: '', model: '', year: '', vin: '', mileage: 0, nextServiceMileage: 5000, fuelType: 'Diesel', status: 'Active',
            });
            setIsModalOpen(false);
            setError(null); // Clear any previous error
        } catch (e) {
            console.error("Error adding document: ", e);
            setError("Failed to add vehicle to the fleet. Check console.");
        }
    };
    
    // Function to load sample data on demand
    const handleLoadSampleData = async () => {
        if (!db || !userId) {
            setError("Database connection not ready.");
            return;
        }

        const sampleVehicles = [
            {
                make: 'Ford', model: 'Transit 350', year: 2021, vin: '1FTSE1EL1MJD12345', mileage: 85000, nextServiceMileage: 80000, fuelType: 'Diesel', status: 'Active',
            },
            {
                make: 'Tesla', model: 'Model 3', year: 2023, vin: '5YJSA1E20NF1234567', mileage: 12000, nextServiceMileage: 25000, fuelType: 'Electric', status: 'Active',
            },
            {
                make: 'Freightliner', model: 'Cascadia 126', year: 2019, vin: '3FLXA9EMXKJ123456', mileage: 150000, nextServiceMileage: 160000, fuelType: 'Diesel', status: 'In Maintenance',
            },
            {
                make: 'Toyota', model: 'Tacoma', year: 2020, vin: '3TMYF5AN6LK123456', mileage: 45000, nextServiceMileage: 55000, fuelType: 'Gasoline', status: 'Active',
            },
        ];

        try {
            const vehiclesRef = collection(db, `artifacts/${appId}/users/${userId}/vehicles`);
            setIsLoading(true);
            
            // Add all sample vehicles
            for (const vehicle of sampleVehicles) {
                await addDoc(vehiclesRef, {
                    ...vehicle,
                    mileage: vehicle.mileage,
                    nextServiceMileage: vehicle.nextServiceMileage,
                    createdAt: serverTimestamp(),
                });
            }
            
            setError("Sample data loaded successfully!");
            // The Firestore listener handles updating the state and setting isLoading to false
        } catch (e) {
            console.error("Error loading sample data: ", e);
            setError("Failed to load sample data. Check console.");
            setIsLoading(false);
        }
    };


    // --- Utility Calculations ---
    const totalVehicles = vehicles.length;
    const activeVehicles = vehicles.filter(v => v.status === 'Active' && v.mileage < v.nextServiceMileage).length;
    const serviceDue = vehicles.filter(v => v.mileage >= v.nextServiceMileage || v.status === 'In Maintenance').length;

    const totalMileage = vehicles.reduce((sum, v) => sum + (v.mileage || 0), 0);
    const avgMileage = totalVehicles > 0 ? (totalMileage / totalVehicles).toFixed(0) : 0;

    // --- Helper Components ---

    const StatsCard = ({ icon, title, value, color }) => (
        <div className={`p-6 bg-white border-l-4 ${color} rounded-xl shadow-md transition hover:shadow-lg`}>
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium text-gray-500">{title}</p>
                    <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
                </div>
                <div className={`p-3 rounded-full bg-opacity-10 ${color.replace('border-', 'text-')}`}>{icon}</div>
            </div>
        </div>
    );

    const VehicleRow = ({ vehicle }) => {
        const mileageLeft = vehicle.nextServiceMileage - vehicle.mileage;
        const mileageDisplay = mileageLeft > 0 
            ? `${mileageLeft.toLocaleString()} mi left`
            : <span className="text-red-600 font-semibold">OVERDUE</span>;
        
        const serviceBarColor = mileageLeft <= 0 ? 'bg-red-500' : 
                                mileageLeft < 1000 ? 'bg-yellow-500' : 'bg-green-500';
        
        // Calculate service completion percentage for the progress bar
        const serviceProgress = vehicle.nextServiceMileage > 0 
            ? Math.min(100, Math.max(0, (vehicle.mileage / vehicle.nextServiceMileage) * 100))
            : 0; // Avoid division by zero
        
        return (
            <tr className="border-b hover:bg-gray-50 transition-colors">
                <td className="p-4 text-sm font-medium text-gray-900 rounded-l-lg">
                    <Truck className="inline w-5 h-5 mr-2 text-blue-500" />
                    {vehicle.make} {vehicle.model} ({vehicle.year})
                </td>
                <td className="p-4 text-sm text-gray-700 font-mono tracking-wider">{vehicle.vin}</td>
                <td className="p-4 text-sm text-gray-700">
                    <span className="font-semibold">{vehicle.mileage.toLocaleString()}</span> mi
                </td>
                <td className="p-4 text-sm text-gray-700">
                    <div className="flex flex-col space-y-1">
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div 
                                className={`h-2.5 rounded-full ${serviceBarColor}`} 
                                style={{ width: `${serviceProgress}%` }}
                            ></div>
                        </div>
                        <span className="text-xs text-gray-500">{mileageDisplay}</span>
                    </div>
                </td>
                <td className="p-4 text-sm">
                    {getStatusBadge(vehicle)}
                </td>
                <td className="p-4 text-sm text-gray-700 rounded-r-lg">
                    {userId}
                </td>
            </tr>
        );
    };
    
    // --- Main Render ---

    if (isLoading && !db) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <Loader2 className="w-8 h-8 mr-3 text-blue-600 animate-spin" />
                <span className="text-lg font-medium text-gray-700">Initializing Fleet Manager...</span>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-4 bg-gray-50 font-sans">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 border-b border-gray-200">
                <h1 className="text-4xl font-extrabold text-gray-900 flex items-center">
                    <BarChart3 className="w-8 h-8 mr-3 text-blue-600" />
                    Fleet Dashboard
                </h1>
                <div className="flex items-center space-x-4 mt-3 md:mt-0">
                    <p className="text-sm text-gray-500 hidden sm:block">
                        User ID: <span className="font-mono text-xs text-blue-700 bg-blue-50 p-1 rounded-md">{userId || 'N/A'}</span>
                    </p>
                    <button
                        onClick={handleLoadSampleData}
                        className="flex items-center px-4 py-2 text-sm font-semibold text-gray-900 bg-yellow-400 rounded-lg shadow-md hover:bg-yellow-500 focus:outline-none focus:ring-2 focus:ring-yellow-300 focus:ring-offset-2 transition duration-150"
                    >
                        <Users className="w-5 h-5 mr-2" />
                        Load Sample Data
                    </button>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="flex items-center px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-150"
                    >
                        <PlusCircle className="w-5 h-5 mr-2" />
                        Add Vehicle
                    </button>
                </div>
            </header>

            {error && (
                <div className="p-4 mt-6 text-red-700 bg-red-100 border border-red-200 rounded-lg flex items-center shadow-sm" role="alert">
                    <AlertCircle className="w-5 h-5 mr-3" />
                    <p className="font-medium">{error}</p>
                </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-1 gap-6 mt-8 sm:grid-cols-2 lg:grid-cols-4">
                <StatsCard 
                    icon={<Truck className="w-6 h-6" />} 
                    title="Total Fleet Size" 
                    value={totalVehicles} 
                    color="border-blue-500"
                />
                <StatsCard 
                    icon={<BarChart3 className="w-6 h-6" />} 
                    title="Active Vehicles" 
                    value={activeVehicles} 
                    color="border-green-500"
                />
                <StatsCard 
                    icon={<Wrench className="w-6 h-6" />} 
                    title="Service/Maintenance Due" 
                    value={serviceDue} 
                    color="border-red-500"
                />
                <StatsCard 
                    icon={<Fuel className="w-6 h-6" />} 
                    title="Avg Mileage" 
                    value={`${avgMileage} mi`} 
                    color="border-purple-500"
                />
            </div>

            {/* Vehicle List */}
            <section className="mt-10 bg-white rounded-xl shadow-xl overflow-hidden">
                <header className="p-5 border-b bg-gray-50">
                    <h2 className="text-xl font-semibold text-gray-800">Current Fleet Details</h2>
                </header>
                
                {isLoading && vehicles.length === 0 ? (
                    <div className="flex items-center justify-center p-12 text-gray-500">
                        <Loader2 className="w-6 h-6 mr-2 animate-spin" />
                        Loading vehicles...
                    </div>
                ) : vehicles.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        <Truck className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p className="text-lg font-medium">No vehicles in the fleet yet.</p>
                        <p className="text-sm">Click "Load Sample Data" or "Add Vehicle" to get started.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="p-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider rounded-tl-lg">Vehicle</th>
                                    <th className="p-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">VIN</th>
                                    <th className="p-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Mileage</th>
                                    <th className="p-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Next Service</th>
                                    <th className="p-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                                    <th className="p-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider rounded-tr-lg">Owner ID</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {vehicles.map(vehicle => (
                                    <VehicleRow key={vehicle.id} vehicle={vehicle} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
            
            {/* Add Vehicle Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 p-4" onClick={() => setIsModalOpen(false)}>
                    <div 
                        className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all duration-300 scale-100 opacity-100"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <header className="flex justify-between items-center p-5 border-b bg-gray-50">
                            <h3 className="text-xl font-bold text-gray-900">Add New Vehicle</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition">
                                <X className="w-6 h-6" />
                            </button>
                        </header>
                        
                        <form onSubmit={handleAddVehicle} className="p-6 space-y-4">
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="make" className="block text-sm font-medium text-gray-700">Make (e.g., Ford)</label>
                                    <input
                                        type="text"
                                        id="make"
                                        name="make"
                                        value={newVehicle.make}
                                        onChange={handleInputChange}
                                        required
                                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="model" className="block text-sm font-medium text-gray-700">Model (e.g., Transit)</label>
                                    <input
                                        type="text"
                                        id="model"
                                        name="model"
                                        value={newVehicle.model}
                                        onChange={handleInputChange}
                                        required
                                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="year" className="block text-sm font-medium text-gray-700">Year</label>
                                    <input
                                        type="number"
                                        id="year"
                                        name="year"
                                        value={newVehicle.year}
                                        onChange={handleInputChange}
                                        min="1900"
                                        max={new Date().getFullYear() + 1}
                                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="fuelType" className="block text-sm font-medium text-gray-700">Fuel Type</label>
                                    <select
                                        id="fuelType"
                                        name="fuelType"
                                        value={newVehicle.fuelType}
                                        onChange={handleInputChange}
                                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border bg-white"
                                    >
                                        <option>Diesel</option>
                                        <option>Gasoline</option>
                                        <option>Electric</option>
                                        <option>Hybrid</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div>
                                <label htmlFor="vin" className="block text-sm font-medium text-gray-700">VIN (Vehicle Identification Number)</label>
                                <input
                                    type="text"
                                    id="vin"
                                    name="vin"
                                    value={newVehicle.vin}
                                    onChange={handleInputChange}
                                    required
                                    maxLength="17"
                                    className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border font-mono tracking-wider uppercase"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="mileage" className="block text-sm font-medium text-gray-700">Current Mileage (mi)</label>
                                    <input
                                        type="number"
                                        id="mileage"
                                        name="mileage"
                                        value={newVehicle.mileage}
                                        onChange={handleInputChange}
                                        min="0"
                                        required
                                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="nextServiceMileage" className="block text-sm font-medium text-gray-700">Next Service At (mi)</label>
                                    <input
                                        type="number"
                                        id="nextServiceMileage"
                                        name="nextServiceMileage"
                                        value={newVehicle.nextServiceMileage}
                                        onChange={handleInputChange}
                                        min={newVehicle.mileage}
                                        required
                                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                                    />
                                </div>
                            </div>
                            
                            <div className="pt-4 flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-200 rounded-lg mr-3 hover:bg-gray-300 transition duration-150"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex items-center px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition duration-150"
                                >
                                    <PlusCircle className="w-5 h-5 mr-2" />
                                    Save Vehicle
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;
