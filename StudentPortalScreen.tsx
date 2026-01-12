import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, FlatList,
  TouchableOpacity, Alert, RefreshControl, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useNavigation } from '@react-navigation/native';

const StudentPortalScreen = () => {
  const [studentData, setStudentData] = useState<any>(null);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const navigation = useNavigation<any>();
  const API_URL = 'https://portal-production-26b9.up.railway.app/';

  useEffect(() => {
    loadStudentData();
  }, []);

const fetchAttendance = async (isRefresh = false) => {
  if (isRefresh) setRefreshing(true);
  else setLoading(true);

  try {
    const storageData = await AsyncStorage.multiGet(['studentId', 'studentObjectId']);
    const studentShortId = storageData[0]?.[1];
    const studentObjectId = storageData[1]?.[1];

    console.log('📱 IDs:', { studentShortId, studentObjectId });

    // Try JOIN first (if short ID exists)
    if (studentShortId) {
      const joinUrl = `${API_URL}/api/student-attendance-join/${studentShortId}`;
      const { data } = await axios.get(joinUrl, { timeout: 10000 });

      setStudentData(prev => ({ ...prev, studentShortId }));
      setAttendance(data.attendances || []);
      return; // Success!
    }

    // Fallback: ObjectId (always works)
    throw new Error('No short ID - using ObjectId');

  } catch (error) {
    console.log('🔄 Using ObjectId fallback (normal)');

    // Reliable ObjectId fetch (your original method)
    const storageData = await AsyncStorage.multiGet(['studentObjectId']);
    const objId = storageData[0]?.[1];

    if (objId) {
      const { data } = await axios.get(`${API_URL}/api/attendance/objectId/${objId}`, { timeout: 10000 });
      setAttendance(Array.isArray(data.attendance) ? data.attendance : []);
    }

    // SILENT - no more annoying alerts
  } finally {
    if (isRefresh) setRefreshing(false);
    else setLoading(false);
  }
};

  const loadStudentData = async () => {
    try {
      const [[, customId], [, objId], [, dataStr]] = await AsyncStorage.multiGet([
        'studentId', 'studentObjectId', 'studentData'
      ]);

      console.log('🔍 Loaded from storage:', { customId, objId, hasData: !!dataStr });

      if (!objId && !customId) {
        Alert.alert('Session Expired', 'Please login again');
        navigation.replace('Login');
        return;
      }

      let studentDataParsed = null;
      if (dataStr) {
        try {
          studentDataParsed = JSON.parse(dataStr);
        } catch {
          console.warn('⚠️ Invalid studentData JSON - clearing');
          await AsyncStorage.removeItem('studentData');
        }
      }

      setStudentData(studentDataParsed);
      await fetchAttendance();

    } catch (error: any) {
      console.error('🚨 Load failed:', error);
      Alert.alert('Storage Error', 'Clear cache and relogin');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAttendance(true);
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.multiRemove(['studentId', 'studentObjectId', 'studentData']);
      console.log('✅ Logged out, storage cleared');
    } catch (error) {
      console.error('Logout error:', error);
    }
    navigation.replace('Login');
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'present': return '#10b981';
      case 'absent': return '#ef4444';
      case 'late': return '#f59e0b';
      default: return '#6b7280';
    }
  };
const renderAttendanceItem = ({ item, index }: any) => (
  <View style={styles.attendanceCard}>
    <View style={styles.cardLeft}>
      <Text style={styles.dateText}>{item.date || 'N/A'}</Text>
    </View>
    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
      <Text style={styles.statusText}>{item.status?.toUpperCase() || 'N/A'}</Text>
    </View>
  </View>
);

  if (loading && !refreshing && attendance.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading Attendance...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Welcome Back!</Text>
          <Text style={styles.nameText}>{studentData?.username || studentData?.name || 'Student'}</Text>
          <Text style={styles.emailText}>{studentData?.email || 'No email'}</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsCard}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{attendance.length}</Text>
          <Text style={styles.statLabel}>Total Days</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: '#10b981' }]}>
            {attendance.filter((a: any) => a.status === 'present').length}
          </Text>
          <Text style={styles.statLabel}>Present</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: '#ef4444' }]}>
            {attendance.filter((a: any) => a.status === 'absent').length}
          </Text>
          <Text style={styles.statLabel}>Absent</Text>
        </View>
      </View>

      <View style={styles.attendanceSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Attendance History</Text>
          <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
            <Text style={styles.refreshText}>⟳</Text>
          </TouchableOpacity>
        </View>

        {attendance.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>📚 No attendance records yet</Text>
            <TouchableOpacity onPress={onRefresh} style={styles.retryButton}>
              <Text style={styles.retryText}>Refresh Data</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={attendance}
            renderItem={renderAttendanceItem}
            keyExtractor={(item: any, index: number) => item.id?.toString() || index.toString()}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={['#6366f1']}
              />
            }
            initialNumToRender={10}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
    </View>
  );
};

// ✅ UPDATED: Added idText style
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9'
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
    fontWeight: '500'
  },
  header: {
    backgroundColor: '#6366f1',
    padding: 24,
    paddingTop: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  welcomeText: { fontSize: 14, color: 'rgba(255,255,255,0.8)' },
  nameText: { fontSize: 24, fontWeight: '700', color: 'white', marginTop: 4 },
  emailText: { fontSize: 14, color: 'rgba(255,255,255,0.9)', marginTop: 4 },
  logoutButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8
  },
  logoutText: { color: 'white', fontWeight: '600' },
  statsCard: {
    backgroundColor: 'white',
    margin: 16,
    padding: 20,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'space-around',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4
  },
  statItem: { alignItems: 'center' },
  statNumber: { fontSize: 28, fontWeight: '700', color: '#6366f1' },
  statLabel: { fontSize: 12, color: '#64748b', marginTop: 4 },
  statDivider: { width: 1, backgroundColor: '#e2e8f0' },
  attendanceSection: { flex: 1, paddingHorizontal: 16 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b'
  },
  refreshButton: {
    padding: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 20
  },
  refreshText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6366f1'
  },
  attendanceCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2
  },
  cardLeft: { flex: 1 },
  dateText: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  subjectText: { fontSize: 14, color: '#64748b', marginTop: 4 },
  // ✅ NEW: attendancesId style
  idText: {
    fontSize: 11,
    color: '#64748b',
    fontFamily: 'monospace',
    marginTop: 2,
    fontWeight: '500'
  },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  statusText: { color: 'white', fontSize: 12, fontWeight: '700' },
  emptyState: {
    backgroundColor: 'white',
    padding: 40,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 1
  },
  emptyText: { fontSize: 16, color: '#94a3b8', textAlign: 'center' },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#6366f1',
    borderRadius: 8
  },
  retryText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14
  },
  listContent: { paddingBottom: 16 }
});

export default StudentPortalScreen;
