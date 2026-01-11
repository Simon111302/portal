const loadStudentData = async (isRefresh = false) => {
  if (isRefresh) setRefreshing(true);
  else setLoading(true);

  try {
    const storedStudentId = await AsyncStorage.getItem('studentId');  // Custom "TEST001"
    const storedObjectId = await AsyncStorage.getItem('studentObjectId');  // ✅ ObjectId "66bb..."
    const storedStudentData = await AsyncStorage.getItem('studentData');

    console.log('🔍 IDs:', { studentId: storedStudentId, objectId: storedObjectId });

    if (!storedObjectId) {  // ✅ CRITICAL: Need ObjectId!
      Alert.alert('Missing Data', 'Please login again (ObjectId required)');
      navigation.replace('Login');
      return;
    }

    const studentData = JSON.parse(storedStudentData!);
    setStudentId(storedStudentId);
    setStudentInfo({
      username: studentData.username || studentData.name || 'Student',
      email: studentData.email || 'email@example.com',
      createdAt: studentData.createdAt ? new Date(studentData.createdAt).toLocaleDateString() : 'Recently',
    });

    // ✅ FIXED: Use /attendance/objectId/ (direct, fast!)
    const url = `http://10.0.2.2:5000/api/attendance/objectId/${storedObjectId}`;
    console.log('📡 Fetching:', url);

    const response = await axios.get(url, { timeout: 15000 });
    console.log('✅ Response:', JSON.stringify(response.data, null, 2));

    // ✅ Handle both formats
    let rawAttendance = response.data.attendance || response.data || [];
    const history: AttendanceRecord[] = Array.isArray(rawAttendance)
      ? rawAttendance
          .filter((att: any) => att && ['present', 'absent', 'late'].includes(att.status))
          .map((att: any) => ({
            _id: att._id || att.id,
            status: att.status as 'present' | 'absent' | 'late',
            timestamp: att.timestamp || new Date(att.date).toISOString(),
            date: att.date || new Date(att.timestamp).toLocaleDateString('en-US'),
          }))
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      : [];

    console.log('✅ History:', history.length, 'records');
    setAttendanceHistory(history);

  } catch (error: any) {
    console.error('❌ Error:', error.message, error.response?.data);

    // Mock for UI testing
    const mockData: AttendanceRecord[] = [
      { _id: '1', status: 'present' as const, timestamp: '2026-01-10T10:00:00Z', date: '01/10/2026' },
      { _id: '2', status: 'absent' as const, timestamp: '2026-01-09T09:00:00Z', date: '01/09/2026' },
    ];
    setAttendanceHistory(mockData);

    Alert.alert('Connection Error', `${error.message}\n\n1. Server running?\n2. Test data created?`,
      [{ text: 'Retry', onPress: () => loadStudentData(isRefresh) }]);
  } finally {
    setLoading(false);
    if (isRefresh) setRefreshing(false);
  }
};
