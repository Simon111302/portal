const loadStudentData = async (isRefresh = false) => {
  if (isRefresh) setRefreshing(true);
  else setLoading(true);

  try {
    const storedStudentId = await AsyncStorage.getItem('studentId');
    const storedObjectId = await AsyncStorage.getItem('studentObjectId');
    const storedStudentData = await AsyncStorage.getItem('studentData');

    console.log('🔍 IDs:', { studentId: storedStudentId, objectId: storedObjectId });

    if (!storedObjectId) {
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

    const API_URL = 'https://portal-production-26b9.up.railway.app';
    // const API_URL = 'http://10.0.2.2:5000';  // Use for local testing

    const url = `${API_URL}/api/attendance/objectId/${storedObjectId}`;
    console.log('📡 Fetching:', url);

    const response = await axios.get(url, { timeout: 15000 });
    console.log('✅ Raw Response:', JSON.stringify(response.data, null, 2));

    let rawAttendance = response.data.attendance || response.data || [];

    // ✅ ADD DETAILED LOGGING
    console.log('📦 Total records received:', rawAttendance.length);

    const history: AttendanceRecord[] = Array.isArray(rawAttendance)
      ? rawAttendance
          .filter((att: any) => {
            const isValid = att && ['present', 'absent', 'late'].includes(att.status);
            if (!isValid) {
              console.log('❌ Invalid record filtered out:', att);
            }
            return isValid;
          })
          .map((att: any, index: number) => {
            const record = {
              _id: att._id || att.id,
              status: att.status as 'present' | 'absent' | 'late',
              timestamp: att.timestamp || new Date(att.date).toISOString(),
              date: att.date || new Date(att.timestamp).toLocaleDateString('en-US'),
            };

            // ✅ LOG EACH MAPPED RECORD
            if (index < 3) {  // Log first 3 records
              console.log(`📋 Record ${index + 1}:`, {
                originalDate: att.date,
                originalTimestamp: att.timestamp,
                mappedDate: record.date,
                mappedTimestamp: record.timestamp,
                status: record.status
              });
            }

            return record;
          })
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      : [];

    console.log('✅ Final history array:', history.length, 'records');

    // ✅ SHOW FIRST RECORD IN ALERT
    if (history.length > 0) {
      Alert.alert(
        'Data Loaded Successfully',
        `Total: ${history.length} records\n\nFirst record:\nDate: ${history[0].date}\nStatus: ${history[0].status}\nTimestamp: ${history[0].timestamp}`
      );
    } else {
      Alert.alert('No Data', 'Backend returned 0 attendance records. Create test data first!');
    }

    setAttendanceHistory(history);

  } catch (error: any) {
    console.error('❌ Error:', error.message, error.response?.data);

    // ✅ REMOVED MOCK DATA - Don't overwrite real data!
    Alert.alert(
      'Connection Error',
      `${error.message}\n\nCheck:\n1. Server running at Railway?\n2. Test data created?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Retry', onPress: () => loadStudentData(isRefresh) }
      ]
    );
  } finally {
    setLoading(false);
    if (isRefresh) setRefreshing(false);
  }
};
